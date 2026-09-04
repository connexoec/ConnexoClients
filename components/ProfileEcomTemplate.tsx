import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import React, { useReducer, useState, useEffect, useRef, useCallback } from 'react';
import { SubscriptionPricePicker } from './SubscriptionPricePicker';
import { isSubscription, defaultPeriod, tierUnitPrice as subTierUnitPrice } from '../src/lib/memberPlans';
import { MemberPlanBadge } from './MemberPlanCard';
import { supabase } from '../src/lib/supabase';
import { ProfileExtraSections } from './ProfileExtraSections';
import { ImageLightbox } from './ImageLightbox';
import FullCatalogView from './FullCatalogView';
import type {
  Profile, UserLink, EcomCartItem, Product, SelectedExtra, EcomPriceTier,
  PaymentGatewaysConfig, EcomStaff, EcomBookingField, SubscriptionPeriod,
} from '../types';
import {
  FaWhatsapp, FaShareAlt, FaShoppingCart, FaShoppingBag, FaPlus, FaMinus,
  FaTimes, FaChevronLeft, FaChevronRight, FaTag, FaCheck,
  FaBoxOpen, FaPhoneAlt, FaEnvelope, FaMapMarkerAlt, FaQrcode,
  FaLock, FaCrown, FaStar, FaSearch, FaClock, FaLayerGroup,
  FaLink, FaUniversity, FaMobileAlt, FaCopy, FaCalendarAlt,
} from 'react-icons/fa';
import { useDebouncedValue, filterCatalog, countByCategory } from '../hooks/useCatalogSearch';

// ─── Cart State Machine ───────────────────────────────────────────────────────

// Returns the unit price from the best matching tier for a given quantity.
// Falls back to the product's regular price string parsed as a number.
const calcTierUnitPrice = (tiers: EcomPriceTier[] | undefined, qty: number, fallbackPriceStr: string): number => {
  if (!tiers?.length) return parseFloat(fallbackPriceStr.replace(/[^0-9.]/g, '')) || 0;
  const sorted = [...tiers].sort((a, b) => b.minQty - a.minQty);
  const match = sorted.find(t => qty >= t.minQty);
  if (match) return parseFloat(match.price.replace(/[^0-9.]/g, '')) || 0;
  return parseFloat(fallbackPriceStr.replace(/[^0-9.]/g, '')) || 0;
};

type CartState = { items: EcomCartItem[]; isOpen: boolean };
type CartAction =
  | { type: 'ADD'; product: Product; selectedExtras?: SelectedExtra[]; extrasUnitPrice?: number; tierUnitPrice?: number }
  | { type: 'REMOVE'; productId: string }
  | { type: 'UPDATE_QTY'; productId: string; qty: number }
  | { type: 'TOGGLE' }
  | { type: 'CLOSE' }
  | { type: 'CLEAR' };

const cartReducer = (state: CartState, action: CartAction): CartState => {
  switch (action.type) {
    case 'ADD': {
      const hasExtras = (action.selectedExtras?.length ?? 0) > 0;
      const existing = !hasExtras ? state.items.find(i => i.product.id === action.product.id && !i.selectedExtras?.length) : null;
      if (existing) {
        const newQty = existing.quantity + 1;
        return { ...state, items: state.items.map(i =>
          i.product.id === action.product.id && !i.selectedExtras?.length
            // En una suscripción el precio lo fija la modalidad elegida, no la
            // cantidad: recalcularlo aquí pisaría el precio anual con el base.
            ? { ...i, quantity: newQty, tierUnitPrice: isSubscription(action.product)
                ? i.tierUnitPrice
                : calcTierUnitPrice(action.product.priceTiers, newQty, action.product.price ?? '0') }
            : i
        )};
      }
      return { ...state, items: [...state.items, {
        product: action.product,
        quantity: 1,
        selectedExtras: action.selectedExtras,
        extrasUnitPrice: action.extrasUnitPrice,
        tierUnitPrice: action.tierUnitPrice ?? calcTierUnitPrice(action.product.priceTiers, 1, action.product.price ?? '0'),
      }]};
    }
    case 'REMOVE':
      return { ...state, items: state.items.filter(i => i.product.id !== action.productId) };
    case 'UPDATE_QTY':
      if (action.qty <= 0) {
        return { ...state, items: state.items.filter(i => i.product.id !== action.productId) };
      }
      return { ...state, items: state.items.map(i =>
        i.product.id === action.productId
          ? { ...i, quantity: action.qty, tierUnitPrice: isSubscription(i.product)
              ? i.tierUnitPrice
              : calcTierUnitPrice(i.product.priceTiers, action.qty, i.product.price ?? '0') }
          : i
      )};
    case 'TOGGLE':
      return { ...state, isOpen: !state.isOpen };
    case 'CLOSE':
      return { ...state, isOpen: false };
    case 'CLEAR':
      return { items: [], isOpen: false };
    default:
      return state;
  }
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface ProfileEcomTemplateProps {
  profile: Profile;
  links: UserLink[];
  onLinkClick?: (linkId: string) => void;
  onSelectProduct?: (product: Product) => void;
  onOpenLeadForm?: () => void;
  onLeaveTestimonial?: () => void;
  isMobilePreview?: boolean;
  currentUser?: any;
  visitorProfile?: any;
  userId?: string | null;
  downloadVCard?: () => Promise<void> | void;
  handleShare?: () => Promise<void> | void;
  setShowQRModal?: (show: boolean) => void;
  isVCardLoading?: boolean;
  handleStartChat?: () => Promise<void> | void;
  isStartingChat?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatWANumber = (num: string) => num.replace(/\D/g, '');
const buildWALink = (phone: string, msg: string) =>
  `https://wa.me/${formatWANumber(phone)}?text=${encodeURIComponent(msg)}`;

// ─── Stock Badge ──────────────────────────────────────────────────────────────

const StockBadge: React.FC<{ stock?: number }> = ({ stock }) => {
  if (stock === undefined || stock === null)
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"><FaCheck className="w-2 h-2" /> Disponible</span>;
  if (stock === 0)
    return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20"><FaTimes className="w-2 h-2" /> Agotado</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/20"><FaBoxOpen className="w-2 h-2" /> {stock} disp.</span>;
};

// ─── Club Ecom Modal (registro de membresía) ──────────────────────────────────

interface EcomClubModalProps {
  profile: Profile;
  sellerId: string | null;
  onClose: () => void;
}

const EcomClubModal: React.FC<EcomClubModalProps> = ({ profile, sellerId, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [memberCode, setMemberCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setError('Escribe tu nombre.'); return; }
    if (!email.trim() && !phone.trim()) { setError('Proporciona tu email o teléfono.'); return; }
    if (!sellerId) { setError('No se pudo identificar la tienda.'); return; }
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('join_ecom_club', {
        p_seller_id: sellerId,
        p_name: name.trim(),
        p_email: email.trim() || null,
        p_phone: phone.trim() || null,
      });
      if (rpcError) throw rpcError;
      setMemberCode(data as string);
    } catch (err: any) {
      setError(err?.message ?? 'Error al registrarse. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-[#0b1219] rounded-t-3xl sm:rounded-2xl border border-[#00e5a0]/25 shadow-2xl shadow-[#00e5a0]/10 p-6 relative animate-slide-up"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white transition">
          <FaTimes className="w-4 h-4" />
        </button>

        {memberCode ? (
          <div className="text-center space-y-4 py-2">
            <div className="text-5xl">🎉</div>
            <h3 className="text-lg font-black text-white">¡Bienvenido al Club!</h3>
            <p className="text-sm text-white/60">Tu código de miembro es:</p>
            <div className="bg-[#00e5a0]/10 border border-[#00e5a0]/30 rounded-2xl px-6 py-4">
              <p className="text-4xl font-black text-[#00e5a0] tracking-[0.2em]">{memberCode}</p>
            </div>
            <p className="text-xs text-white/40">Guarda este código para obtener descuentos en tus próximas compras.</p>
            <button onClick={onClose}
              className="w-full py-3 rounded-xl bg-[#00e5a0] text-black font-black text-sm uppercase tracking-wider transition-all active:scale-95">
              ¡Listo!
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-5">
              <div className="w-10 h-10 rounded-xl bg-[#00e5a0]/15 flex items-center justify-center text-xl shrink-0">🛍️</div>
              <div>
                <h3 className="text-base font-black text-white leading-tight">Únete al Club</h3>
                <p className="text-xs text-white/50 mt-0.5">{profile.displayName}</p>
              </div>
            </div>
            <p className="text-xs text-white/50 mb-4 leading-relaxed">
              Regístrate gratis y accede a descuentos exclusivos y beneficios VIP.
            </p>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Tu nombre *"
                className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Email (recomendado)"
                className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25" />
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="WhatsApp / Teléfono"
                className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25" />
              {error && <p className="text-xs text-red-400 font-bold">{error}</p>}
              <button type="submit" disabled={submitting}
                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-black bg-[#00e5a0] hover:bg-[#00cfa0] disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-[#00e5a0]/20">
                {submitting ? 'Registrando...' : 'Obtener mi código gratis'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Member Lookup Modal (consultar tarjeta) ──────────────────────────────────

interface EcomMemberLookupProps {
  profile: Profile;
  sellerId: string | null;
  onClose: () => void;
  onApplyCode?: (code: string) => void;
}

const EcomMemberLookup: React.FC<EcomMemberLookupProps> = ({ profile, sellerId, onClose, onApplyCode }) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [member, setMember] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !sellerId) return;
    setSearching(true);
    setMember(null);
    setNotFound(false);
    try {
      const { data, error } = await supabase.rpc('get_ecom_member', {
        p_seller_id: sellerId,
        p_query: query.trim(),
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (result) setMember(result);
      else setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="w-full sm:max-w-sm bg-[#0b1219] rounded-t-3xl sm:rounded-2xl border border-white/10 shadow-2xl p-6 relative animate-slide-up"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white transition">
          <FaTimes className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center shrink-0">
            <FaSearch className="text-[#00e5a0] w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-black text-white">Consultar mi tarjeta</h3>
            <p className="text-xs text-white/50">Club {profile.displayName}</p>
          </div>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2 mb-4">
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Código, email o teléfono"
            className="flex-1 bg-white/5 border border-white/10 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25"
          />
          <button type="submit" disabled={searching || !query.trim()}
            className="px-4 py-3 rounded-xl bg-[#00e5a0] text-black font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95">
            {searching ? '...' : 'Buscar'}
          </button>
        </form>

        {notFound && (
          <p className="text-sm text-red-400 font-bold text-center py-4">
            No encontramos tu membresía. ¿Ya te registraste?
          </p>
        )}

        {member && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-[#00e5a0]/10 to-transparent border border-[#00e5a0]/25 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-white/40 uppercase tracking-widest font-bold">Tarjeta de miembro</p>
                {member.is_vip && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-[#00e5a0] bg-[#00e5a0]/15 border border-[#00e5a0]/30 rounded-full px-2 py-0.5">
                    <FaCrown size={9} /> VIP
                  </span>
                )}
              </div>
              <p className="text-2xl font-black text-white mb-1">{member.name || 'Miembro'}</p>
              <p className="text-3xl font-black text-[#00e5a0] tracking-[0.15em] mb-3">{member.member_code}</p>
              <div className="mt-3 text-left"><MemberPlanBadge ownerId={sellerId} identifier={member.member_code} system="ecom" accent="#00e5a0" /></div>
              <div className="flex items-center gap-3 text-[11px] text-white/50">
                <span className="flex items-center gap-1"><FaStar size={9} className="text-[#00e5a0]" /> {member.visits} compra{member.visits !== 1 ? 's' : ''}</span>
                {member.discount_percent > 0 && (
                  <span className="text-[#00e5a0] font-black">{member.discount_percent}% DESC.</span>
                )}
              </div>
              {member.benefits && (
                <div className="mt-3 p-3 bg-[#00e5a0]/5 border border-[#00e5a0]/15 rounded-xl">
                  <p className="text-xs text-[#00e5a0] font-bold">🎁 Tus beneficios:</p>
                  <p className="text-xs text-white/70 mt-1 leading-relaxed">{member.benefits}</p>
                </div>
              )}
            </div>
            {onApplyCode && member.member_code && (
              <button
                onClick={() => { onApplyCode(member.member_code); onClose(); }}
                className="w-full py-3.5 rounded-xl bg-[#00e5a0] text-black font-black text-sm uppercase tracking-wider transition-all active:scale-95 shadow-lg shadow-[#00e5a0]/20">
                Usar descuento en mi compra
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Ecom Order Tracker ───────────────────────────────────────────────────────

const ECOM_STATUS_META: Record<string, { label: string; emoji: string }> = {
  pendiente: { label: 'Recibido',  emoji: '📦' },
  empacado:  { label: 'Empacando', emoji: '🎁' },
  enviado:   { label: 'En camino', emoji: '🚚' },
  entregado: { label: 'Entregado', emoji: '✅' },
  cancelado: { label: 'Cancelado', emoji: '❌' },
};

const ECOM_PIPELINE = ['pendiente', 'empacado', 'enviado', 'entregado'];

interface EcomOrderTrackerProps {
  sellerId: string | null;
  initialCode: string | null;
  isMobilePreview: boolean;
  onClose: () => void;
}

const EcomOrderTracker: React.FC<EcomOrderTrackerProps> = ({ sellerId, initialCode, isMobilePreview, onClose }) => {
  const [code, setCode] = useState(initialCode || '');
  const [tracking, setTracking] = useState(!!initialCode);
  const [data, setData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchStatus = useCallback(async (c: string) => {
    if (isMobilePreview) {
      setData({ found: true, status: 'enviado', estimated_minutes: 30, code: c.toUpperCase(), total_price: 0 });
      return;
    }
    if (!sellerId || !c) return;
    try {
      const { data: d, error } = await supabase.rpc('get_ecom_order_status', {
        p_seller_id: sellerId,
        p_code: c.trim(),
      });
      if (error) throw error;
      if (d && d.found) { setData(d); setNotFound(false); }
      else { setNotFound(true); setData(null); }
    } catch {
      setNotFound(true);
    }
  }, [sellerId, isMobilePreview]);

  useEffect(() => {
    if (!tracking || !code) return;
    fetchStatus(code);
    const id = setInterval(() => fetchStatus(code), 6000);
    return () => clearInterval(id);
  }, [tracking, code, fetchStatus]);

  const currentIdx = data ? ECOM_PIPELINE.indexOf(data.status) : -1;
  const cancelled = data?.status === 'cancelado';

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-sm bg-[#0b1219] rounded-t-3xl sm:rounded-2xl border border-[#00e5a0]/30 shadow-2xl p-6 relative animate-slide-up"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        onClick={e => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-white/30 hover:text-white transition">
          <FaTimes className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#00e5a0]/15 flex items-center justify-center shrink-0">
            <FaClock className="text-[#00e5a0] w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-black text-white">Estado de tu pedido</h3>
            <p className="text-xs text-white/40">Actualiza cada pocos segundos</p>
          </div>
        </div>

        {!tracking ? (
          <form
            onSubmit={e => { e.preventDefault(); if (code.trim()) setTracking(true); }}
            className="space-y-3"
          >
            <p className="text-xs text-white/40 leading-relaxed">
              Ingresa el código que recibiste al hacer tu pedido.
            </p>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="Código del pedido (ej. A3F9C1)"
              className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25 uppercase tracking-widest font-mono"
            />
            <button
              type="submit"
              disabled={!code.trim()}
              className="w-full py-3 rounded-xl bg-[#00e5a0] hover:bg-[#00cfa0] text-black font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95"
            >
              Ver estado
            </button>
          </form>
        ) : notFound ? (
          <div className="text-center py-6 space-y-3">
            <div className="text-4xl">🔍</div>
            <p className="text-sm text-white/50">No encontramos un pedido con ese código.</p>
            <button
              onClick={() => { setTracking(false); setNotFound(false); setCode(''); }}
              className="text-[11px] font-black uppercase tracking-wider text-[#00e5a0]"
            >
              Intentar con otro código
            </button>
          </div>
        ) : !data ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00e5a0]" />
          </div>
        ) : cancelled ? (
          <div className="text-center py-6 space-y-2">
            <div className="text-4xl">❌</div>
            <p className="text-sm font-black text-red-400">Pedido cancelado</p>
            <p className="text-[11px] text-white/30 font-mono tracking-widest">#{data.code}</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-5xl mb-1">{ECOM_STATUS_META[data.status]?.emoji ?? '📦'}</div>
              <p className="text-xl font-black text-white">{ECOM_STATUS_META[data.status]?.label ?? data.status}</p>
              {data.estimated_minutes != null && data.status !== 'entregado' && (
                <p className="text-xs text-[#00e5a0] font-bold mt-1">
                  Tiempo estimado: {data.estimated_minutes} min
                </p>
              )}
              <p className="text-[10px] text-white/25 mt-1 font-mono tracking-widest">Pedido #{data.code}</p>
            </div>

            {/* Pipeline */}
            <div className="flex items-start gap-1">
              {ECOM_PIPELINE.map((step, i) => {
                const done = i <= currentIdx;
                const active = i === currentIdx;
                return (
                  <React.Fragment key={step}>
                    <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs border-2 transition-all shrink-0 ${
                        done
                          ? active
                            ? 'bg-[#00e5a0] border-[#00e5a0] text-black shadow-lg shadow-[#00e5a0]/30 scale-110'
                            : 'bg-[#00e5a0] border-[#00e5a0] text-black'
                          : 'bg-black/40 border-white/10 text-white/20'
                      }`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <span className={`text-[9px] uppercase tracking-wide text-center leading-tight font-bold ${
                        done ? 'text-[#00e5a0]' : 'text-white/20'
                      }`}>
                        {ECOM_STATUS_META[step]?.label}
                      </span>
                    </div>
                    {i < ECOM_PIPELINE.length - 1 && (
                      <div className={`h-0.5 flex-1 mt-4 transition-all ${i < currentIdx ? 'bg-[#00e5a0]' : 'bg-white/10'}`} />
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <p className="text-[10px] text-white/20 text-center">
              Esta pantalla se actualiza automáticamente.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Product Modal ────────────────────────────────────────────────────────────

interface ProductModalProps {
  product: Product;
  profile: Profile;
  isUltra: boolean;
  onClose: () => void;
  onAddToCart: (p: Product, extras: SelectedExtra[], extrasPrice: number, tierUnitPrice?: number) => void;
  onCheckout: (items: EcomCartItem[]) => void;
}

const ProductModal: React.FC<ProductModalProps> = ({ product, profile, isUltra, onClose, onAddToCart, onCheckout }) => {
  const [imgIndex, setImgIndex] = useState(0);
  const [qty, setQty] = useState(Math.max(1, product.minQty ?? 1));
  const [addedFeedback, setAddedFeedback] = useState(false);
  const [extrasSelections, setExtrasSelections] = useState<Record<string, string[]>>({})

  const toggleExtra = (groupId: string, optionId: string, multi: boolean) => {
    setExtrasSelections(prev => {
      const cur = prev[groupId] ?? [];
      if (multi) return { ...prev, [groupId]: cur.includes(optionId) ? cur.filter(x => x !== optionId) : [...cur, optionId] };
      return { ...prev, [groupId]: cur.includes(optionId) ? [] : [optionId] };
    });
  };

  const buildSelectedExtras = (): SelectedExtra[] => {
    if (!product.extras?.length) return [];
    return product.extras.flatMap(group =>
      group.options.filter(o => (extrasSelections[group.id] ?? []).includes(o.id)).map(o => ({
        groupId: group.id, groupName: group.name, optionId: o.id, optionLabel: o.label, optionPrice: o.price,
      }))
    );
  };

  const extrasUnitPrice = (product.extras ?? []).reduce((sum, group) =>
    sum + group.options.filter(o => (extrasSelections[group.id] ?? []).includes(o.id)).reduce((s, o) => s + o.price, 0), 0);

  // Lock body scroll while modal is open (prevents background page scroll on iOS)
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const images = [
    ...(product.imageURLs ?? []),
    ...(product.imageURL && !product.imageURLs?.includes(product.imageURL) ? [product.imageURL] : []),
  ].filter(Boolean);

  const soldOut = product.stock === 0;
  const mode = product.checkoutMode ?? 'whatsapp';

  // ⚠️ Modalidad elegida en el selector. Vive AQUÍ y no dentro del selector
  // porque el precio del carrito depende de ella: antes `tierUnitPrice` salía
  // siempre de `product.price`, así que pulsar «Anual» y «Pedir ahora» seguía
  // llevándose el importe del mensual.
  const esSuscripcion = isSubscription(product);
  const [subPeriod, setSubPeriod] = React.useState<SubscriptionPeriod>(
    () => defaultPeriod(product.subscription)
  );

  const tierUnitPrice = esSuscripcion
    ? subTierUnitPrice(product.subscription, subPeriod)
    : calcTierUnitPrice(product.priceTiers, qty, product.price ?? '0');
  const hasTiers = (product.priceTiers?.length ?? 0) > 0;
  const belowMinQty = product.minQty && qty < product.minQty;

  const handleAddToCart = () => {
    if (soldOut) return;
    onAddToCart(product, buildSelectedExtras(), extrasUnitPrice, tierUnitPrice);
    setAddedFeedback(true);
    setTimeout(() => setAddedFeedback(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="w-full sm:max-w-lg bg-[#0b1219] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-slide-up"
        style={{ maxHeight: '92svh', fontFamily: "'Space Grotesk', sans-serif" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Image Carousel */}
        <div className="relative w-full bg-black/40 shrink-0" style={{ height: '200px' }}>
          {images.length > 0 ? (
            <>
              <img src={images[imgIndex]} alt={product.name} className="w-full h-full object-contain" />
              {images.length > 1 && (
                <>
                  <button onClick={() => setImgIndex(i => (i === 0 ? images.length - 1 : i - 1))}
                    className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition">
                    <FaChevronLeft className="w-3 h-3" />
                  </button>
                  <button onClick={() => setImgIndex(i => (i === images.length - 1 ? 0 : i + 1))}
                    className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition">
                    <FaChevronRight className="w-3 h-3" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, idx) => (
                      <button key={idx} onClick={() => setImgIndex(idx)}
                        className={`w-1.5 h-1.5 rounded-full transition-all ${idx === imgIndex ? 'bg-white scale-125' : 'bg-white/40'}`} />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/20 text-6xl">🛍️</div>
          )}
          <button onClick={onClose}
            className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition">
            <FaTimes className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 right-3"><StockBadge stock={product.stock} /></div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-scroll p-5 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <div>
            <h2 className="cnx-product-text text-xl font-black text-white leading-tight">{product.name}</h2>
            {/* Selector Mensual/Anual con el ahorro: sólo en productos con
                suscripción activada; el resto conserva su precio de siempre. */}
            {isSubscription(product)
              ? <div className="mt-2.5">
                  <SubscriptionPricePicker subscription={product.subscription} accent="#00e5a0"
                    period={subPeriod} onPeriodChange={setSubPeriod} />
                </div>
              : product.price && <p className="text-2xl font-black text-[#00e5a0] mt-1">{product.price}</p>}
          </div>
          {(product.longDescription || product.shortDescription) && (
            <p className="text-sm text-white/75 leading-relaxed whitespace-pre-wrap">
              {product.longDescription ?? product.shortDescription}
            </p>
          )}

          {/* Extras / Complementos */}
          {(product.extras ?? []).filter(g => g.options?.length > 0).map(group => (
            <div key={group.id}>
              <p className="text-[11px] text-white/50 uppercase tracking-widest font-bold mb-2">
                {group.name}
                {group.required && <span className="text-red-400 ml-1">*</span>}
                {group.multiSelect && <span className="text-white/25 font-normal ml-1 normal-case tracking-normal">· Selección múltiple</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {group.options.map(opt => {
                  const selected = (extrasSelections[group.id] ?? []).includes(opt.id);
                  return (
                    <button key={opt.id} type="button"
                      onClick={() => toggleExtra(group.id, opt.id, !!group.multiSelect)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all active:scale-95 ${
                        selected ? 'bg-[#00e5a0] border-[#00e5a0] text-black' : 'bg-white/5 border-white/10 text-white/70 hover:border-[#00e5a0]/40'
                      }`}>
                      {opt.label}
                      {opt.price > 0 && (
                        <span className={selected ? 'text-black/60 ml-1' : 'text-[#00e5a0]/70 ml-1'}>
                          +${opt.price.toFixed(2)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {extrasUnitPrice > 0 && (
            <div className="flex justify-between items-center py-1 border-t border-white/5">
              <span className="text-xs text-white/50">Extras</span>
              <span className="text-sm font-black text-[#00e5a0]">+${extrasUnitPrice.toFixed(2)}</span>
            </div>
          )}

          {/* ── Tabla de precios por volumen ── */}
          {hasTiers && (
            <div className="bg-black/30 border border-[#00e5a0]/20 rounded-xl p-3 space-y-2">
              <p className="text-[11px] text-[#00e5a0] uppercase tracking-widest font-black flex items-center gap-1.5">
                <FaLayerGroup size={10} /> Precios por volumen
              </p>
              <div className="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-1">
                <span className="text-[10px] text-white/30 font-bold uppercase">Desde</span>
                <span className="text-[10px] text-white/30 font-bold uppercase">Precio unit.</span>
                <span className="text-[10px] text-white/30 font-bold uppercase">Total</span>
                {([...(product.priceTiers ?? [])].sort((a, b) => a.minQty - b.minQty)).map((tier, ti) => {
                  const active = qty >= tier.minQty;
                  return (
                    <React.Fragment key={ti}>
                      <span className={`text-xs font-bold ${active ? 'text-[#00e5a0]' : 'text-white/40'}`}>{tier.minQty}+</span>
                      <span className={`text-xs font-mono font-bold ${active ? 'text-[#00e5a0]' : 'text-white/40'}`}>{tier.price}</span>
                      <span className={`text-xs font-mono ${active ? 'text-white/70' : 'text-white/25'}`}>
                        ${(parseFloat(tier.price.replace(/[^0-9.]/g, '')) * qty || 0).toFixed(2)}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="border-t border-white/10 pt-1.5 flex justify-between items-center">
                <span className="text-xs text-white/50">Tu precio actual ({qty} uds):</span>
                <span className="text-sm font-black text-[#00e5a0]">${(tierUnitPrice + extrasUnitPrice).toFixed(2)}/u</span>
              </div>
            </div>
          )}

          {!soldOut && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Cantidad</span>
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1">
                  <button onClick={() => setQty(q => Math.max(product.minQty ?? 1, q - 1))} className="text-white/60 hover:text-white transition p-1">
                    <FaMinus className="w-3 h-3" />
                  </button>
                  <span className="text-white font-bold w-6 text-center">{qty}</span>
                  <button onClick={() => setQty(q => q + 1)} className="text-white/60 hover:text-white transition p-1">
                    <FaPlus className="w-3 h-3" />
                  </button>
                </div>
                {product.minQty && product.minQty > 1 && (
                  <span className="text-[10px] text-white/30">Mín. {product.minQty}</span>
                )}
              </div>
              {belowMinQty && (
                <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  ⚠️ El pedido mínimo para este producto es <strong>{product.minQty} unidades</strong>.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 p-4 border-t border-white/10 bg-black/30 space-y-2">
          {soldOut ? (
            <div className="w-full py-3 text-center text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl">
              Producto Agotado
            </div>
          ) : (
            <>
              {isUltra && (
                <button onClick={handleAddToCart}
                  className={`w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 transition-all active:scale-95 ${
                    addedFeedback ? 'bg-[#00e5a0] text-black' : 'bg-white/10 border border-white/20 text-white hover:bg-white/15'
                  }`}>
                  {addedFeedback ? <><FaCheck /> ¡Añadido!</> : <><FaShoppingCart /> Añadir al Carrito</>}
                </button>
              )}
              {(mode === 'stripe' || mode === 'both') && product.stripeURL && (
                <a href={product.stripeURL} target="_blank" rel="noopener noreferrer"
                  className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-center text-black bg-[#00e5a0] hover:bg-[#00cfa0] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#00e5a0]/20">
                  <FaLock className="w-3.5 h-3.5" /> Pagar con tarjeta
                </a>
              )}
              {mode !== 'stripe' && (
                <button
                  disabled={!!belowMinQty}
                  onClick={() => onCheckout([{ product, quantity: qty, selectedExtras: buildSelectedExtras(), extrasUnitPrice, tierUnitPrice }])}
                  className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-center text-black bg-[#00e5a0] hover:bg-[#00cfa0] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#00e5a0]/20 disabled:opacity-50">
                  <FaShoppingBag className="w-4 h-4" /> Pedir ahora
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Cart Drawer (ULTRA) ──────────────────────────────────────────────────────

interface CartDrawerProps {
  state: CartState;
  dispatch: React.Dispatch<CartAction>;
  profile: Profile;
  onCheckout: (items: EcomCartItem[]) => void;
}

const CartDrawer: React.FC<CartDrawerProps> = ({ state, dispatch, profile, onCheckout }) => {
  const total = state.items.reduce((acc, i) => {
    const unitPrice = i.tierUnitPrice ?? (parseFloat((i.product.price ?? '0').replace(/[^0-9.]/g, '')) || 0);
    return acc + (unitPrice + (i.extrasUnitPrice ?? 0)) * i.quantity;
  }, 0);

  return (
    <>
      <div className="fixed inset-0 z-[9990] bg-black/60 backdrop-blur-sm"
        onClick={() => dispatch({ type: 'CLOSE' })} />
      <div className="fixed right-0 top-0 bottom-0 z-[9991] w-full max-w-xs bg-[#0b1219] border-l border-white/10 flex flex-col shadow-2xl animate-slide-in-right"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <FaShoppingCart className="text-[#00e5a0]" /> Tu Carrito
            <span className="bg-[#00e5a0] text-black text-[10px] font-black px-1.5 py-0.5 rounded-full">
              {state.items.reduce((a, i) => a + i.quantity, 0)}
            </span>
          </h2>
          <button onClick={() => dispatch({ type: 'CLOSE' })} className="text-white/50 hover:text-white transition p-1">
            <FaTimes className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {state.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
              <span className="text-5xl opacity-30">🛒</span>
              <p className="text-white/40 text-sm">Tu carrito está vacío</p>
            </div>
          ) : (
            state.items.map(item => (
              <div key={item.product.id} className="flex gap-3 bg-white/5 rounded-xl p-3 border border-white/5">
                {item.product.imageURL && (
                  <img src={item.product.imageURL} alt={item.product.name}
                    className="w-14 h-14 object-cover rounded-lg shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{item.product.name}</p>
                  {(item.tierUnitPrice != null || item.product.price) && (
                    <p className="text-xs text-[#00e5a0] font-bold mt-0.5">
                      ${(item.tierUnitPrice ?? (parseFloat((item.product.price ?? '0').replace(/[^0-9.]/g, '')) || 0)).toFixed(2)}/u
                      {item.extrasUnitPrice ? ` +$${item.extrasUnitPrice.toFixed(2)}` : ''}
                      {(item.tierUnitPrice != null && (item.product.priceTiers?.length ?? 0) > 0) ? <span className="text-[#00e5a0]/50 text-[9px] ml-1 font-normal">tramo</span> : null}
                    </p>
                  )}
                  {item.selectedExtras && item.selectedExtras.length > 0 && (
                    <p className="text-[10px] text-white/30 mt-0.5 truncate">{item.selectedExtras.map(e => e.optionLabel).join(', ')}</p>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => dispatch({ type: 'UPDATE_QTY', productId: item.product.id, qty: item.quantity - 1 })}
                      className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition">
                      <FaMinus className="w-2.5 h-2.5" />
                    </button>
                    <span className="text-white text-sm font-bold w-5 text-center">{item.quantity}</span>
                    <button onClick={() => dispatch({ type: 'UPDATE_QTY', productId: item.product.id, qty: item.quantity + 1 })}
                      className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition">
                      <FaPlus className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </div>
                <button onClick={() => dispatch({ type: 'REMOVE', productId: item.product.id })}
                  className="text-white/30 hover:text-red-400 transition self-start p-1">
                  <FaTimes className="w-3 h-3" />
                </button>
              </div>
            ))
          )}
        </div>
        {state.items.length > 0 && (
          <div className="shrink-0 border-t border-white/10 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-white/60 font-bold uppercase tracking-widest">Total</span>
              <span className="text-xl font-black text-white">${total.toFixed(2)}</span>
            </div>
            <button onClick={() => onCheckout(state.items)}
              className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-center text-black bg-[#00e5a0] hover:bg-[#00cfa0] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#00e5a0]/20">
              <FaShoppingBag className="w-4 h-4" /> Finalizar pedido
            </button>
            <button onClick={() => dispatch({ type: 'CLEAR' })}
              className="w-full py-2 text-xs text-white/30 hover:text-white/60 transition">
              Vaciar carrito
            </button>
          </div>
        )}
      </div>
    </>
  );
};

// ─── Ecom Invoice Modal ───────────────────────────────────────────────────────

interface EcomInvoiceModalProps {
  sellerId: string | null;
  orderCode: string;
  prefillName: string;
  prefillPhone: string;
  memberCode: string;
  profile: Profile;
  onClose: () => void;
  onDone: () => void;
}

const EcomInvoiceModal: React.FC<EcomInvoiceModalProps> = ({
  sellerId, orderCode, prefillName, prefillPhone, memberCode, profile, onClose, onDone,
}) => {
  const [fullName, setFullName] = useState(prefillName);
  const [razonSocial, setRazonSocial] = useState('');
  const [ruc, setRuc] = useState('');
  const [phone, setPhone] = useState(prefillPhone);
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupCode, setLookupCode] = useState(memberCode);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const handleLookup = async () => {
    if (!lookupCode.trim() || !sellerId) return;
    setLookingUp(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc('get_ecom_member', { p_seller_id: sellerId, p_query: lookupCode.trim() });
      if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data;
      if (r) {
        if (r.name && !fullName.trim()) setFullName(r.name);
        if (r.phone && !phone.trim()) setPhone(r.phone);
        if (r.email && !email.trim()) setEmail(r.email);
        setMsg('✅ Datos autocompletados');
      } else {
        setMsg('❌ Código no encontrado.');
      }
    } catch {
      setMsg('❌ Error al buscar.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !ruc.trim() || !phone.trim() || !sellerId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('submit_ecom_invoice', {
        p_seller_id: sellerId,
        p_code: orderCode,
        p_full_name: fullName.trim(),
        p_ruc: ruc.trim(),
        p_phone: phone.trim(),
        p_email: email.trim() || null,
        p_address: address.trim() || null,
      });
      if (error) throw error;
      onDone();
    } catch (err: any) {
      setMsg(`❌ ${err?.message ?? 'No se pudo enviar la factura.'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const inp = "mt-1 w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25";

  return (
    <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/90 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-[#0b1219] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-[#00e5a0]/20 flex flex-col overflow-hidden animate-slide-up"
        style={{ maxHeight: '92svh', fontFamily: "'Space Grotesk', sans-serif" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-base font-black text-white flex items-center gap-2">🧾 Datos de Factura</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white transition p-1"><FaTimes className="w-4 h-4" /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-scroll p-5 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
          <p className="text-xs text-white/40 -mt-1">
            Pedido <span className="text-[#00e5a0] font-bold">#{orderCode}</span>. Completa los datos para tu factura electrónica.
          </p>

          {/* Autocompletar con código */}
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Autocompletar con código de miembro</label>
            <div className="flex gap-2 mt-1">
              <input value={lookupCode} onChange={e => setLookupCode(e.target.value.toUpperCase())}
                placeholder="E-XXXX"
                className="flex-1 bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25 font-mono" />
              <button type="button" onClick={handleLookup} disabled={lookingUp || !lookupCode.trim()}
                className="px-3 py-2.5 rounded-xl bg-[#00e5a0]/15 border border-[#00e5a0]/25 text-[#00e5a0] text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all hover:bg-[#00e5a0]/25">
                {lookingUp ? '...' : 'Buscar'}
              </button>
            </div>
            {msg && (
              <p className={`text-xs mt-1.5 font-bold ${msg.startsWith('✅') ? 'text-[#00e5a0]' : 'text-red-400'}`}>{msg}</p>
            )}
          </div>

          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Nombre completo *</label>
            <input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Nombre y apellido" className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Razón social</label>
            <input value={razonSocial} onChange={e => setRazonSocial(e.target.value)} placeholder="Nombre de la empresa (si aplica)" className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">RUC / Cédula *</label>
            <input required value={ruc} onChange={e => setRuc(e.target.value)} placeholder="1234567890001" className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Teléfono *</label>
            <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+593 9..." className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Correo electrónico</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="tu@email.com" className={inp} />
          </div>
          <div>
            <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Dirección</label>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="Calle, número, ciudad" className={inp} />
          </div>

        </div>
        <div className="shrink-0 px-5 pb-5 pt-3 border-t border-white/5 bg-[#0b1219]">
          <div className="flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all">
              Cancelar
            </button>
            <button type="submit" disabled={submitting || !fullName.trim() || !ruc.trim() || !phone.trim()}
              className="flex-1 py-3 rounded-xl bg-[#00e5a0] hover:bg-[#00cfa0] text-black text-xs font-black uppercase tracking-wider disabled:opacity-50 active:scale-95 transition-all">
              {submitting ? 'Enviando...' : 'Enviar datos'}
            </button>
          </div>
        </div>
        </form>
      </div>
    </div>
  );
};

// ─── Checkout Modal ───────────────────────────────────────────────────────────

interface CheckoutModalProps {
  items: EcomCartItem[];
  profile: Profile;
  sellerId: string | null;
  onClose: () => void;
  onOrderPlaced: () => void;
  prefillMemberCode?: string;
  onTrackOrder?: (code: string) => void;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ items, profile, sellerId, onClose, onOrderPlaced, prefillMemberCode, onTrackOrder }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');
  const [memberCode, setMemberCode] = useState(prefillMemberCode ?? '');
  const [memberDiscount, setMemberDiscount] = useState(0);
  const [memberName, setMemberName] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupMsg, setLookupMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [orderRef, setOrderRef] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceDone, setInvoiceDone] = useState(false);
  const [orderType, setOrderType] = useState<'domicilio' | 'local'>('domicilio');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [payphoneBusy, setPayphoneBusy] = useState(false);
  const [payphoneMsg, setPayphoneMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  const waPhone = profile.whatsapp ?? profile.phone ?? '';

  const rawTotal = items.reduce((acc, i) => {
    const unitPrice = i.tierUnitPrice ?? (parseFloat((i.product.price ?? '0').replace(/[^0-9.]/g, '')) || 0);
    return acc + (unitPrice + (i.extrasUnitPrice ?? 0)) * i.quantity;
  }, 0);

  const deliveryFeeAmount = orderType === 'domicilio' && profile.deliveryFee ? Number(profile.deliveryFee) : 0;
  const discountAmount = rawTotal * (memberDiscount / 100);
  const total = rawTotal - discountAmount + deliveryFeeAmount;
  const itemCount = items.reduce((a, i) => a + i.quantity, 0);
  const itemsPayload = items.map(i => {
    const extrasDesc = i.selectedExtras?.length ? ` (${i.selectedExtras.map(e => e.optionLabel).join(', ')})` : '';
    return { name: `${i.product.name}${extrasDesc}`, qty: i.quantity, price: i.product.price ?? '', extras: i.selectedExtras ?? [] };
  });

  const handleLookupMember = async () => {
    if (!memberCode.trim() || !sellerId) return;
    setLookingUp(true);
    setLookupMsg(null);
    setMemberDiscount(0);
    setMemberName('');
    try {
      const { data, error } = await supabase.rpc('get_ecom_member', {
        p_seller_id: sellerId,
        p_query: memberCode.trim(),
      });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] : data;
      if (result) {
        setMemberDiscount(result.discount_percent ?? 0);
        setMemberName(result.name ?? '');
        if (result.name && !name.trim()) setName(result.name);
        if (result.phone && !phone.trim()) setPhone(result.phone);
        if (result.discount_percent > 0) {
          setLookupMsg(`✅ ¡Descuento de ${result.discount_percent}% aplicado!`);
        } else {
          setLookupMsg(`✅ Código válido${result.name ? ` — Hola ${result.name}` : ''}.`);
        }
      } else {
        setLookupMsg('❌ Código no encontrado. Verifica e intenta de nuevo.');
      }
    } catch {
      setLookupMsg('❌ No se pudo verificar el código.');
    } finally {
      setLookingUp(false);
    }
  };

  const buildWA = (ref?: string | null) => {
    const list = items.map(i => {
      const extrasLine = i.selectedExtras?.length ? ` [${i.selectedExtras.map(e => e.optionLabel).join(', ')}]` : '';
      return `• ${i.quantity}x ${i.product.name}${extrasLine} — ${i.product.price ?? 'consultar'}`;
    }).join('\n');
    const discountLine = memberDiscount > 0 ? `Descuento miembro (${memberDiscount}%): -$${discountAmount.toFixed(2)}\n` : '';
    const deliveryLine = deliveryFeeAmount > 0 ? `Envío a domicilio: +$${deliveryFeeAmount.toFixed(2)}\n` : '';
    const msg =
      `¡Hola ${profile.displayName}! Quiero confirmar este pedido${ref ? ` (#${ref})` : ''}:\n\n${list}\n\n` +
      `${discountLine}${deliveryLine}Total: $${total.toFixed(2)}\n` +
      `Entrega: ${orderType === 'local' ? 'Retiro en local' : 'Domicilio'}\n` +
      (orderType === 'domicilio' && deliveryAddress ? `Dirección: ${deliveryAddress}\n` : '') +
      `Nombre: ${name}\n` +
      (city ? `Ciudad: ${city}\n` : '') +
      (memberCode ? `Código miembro: ${memberCode}\n` : '') +
      (notes ? `Notas: ${notes}\n` : '');
    return buildWALink(waPhone, msg);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || submitting) return;
    if (orderType === 'domicilio' && !deliveryAddress.trim()) {
      setErrorMsg('Por favor ingresa tu dirección de entrega.');
      return;
    }
    setErrorMsg(null);
    if (!sellerId) { setErrorMsg('No se pudo identificar la tienda. Recarga e intenta de nuevo.'); return; }
    setSubmitting(true);
    let ref: string | null = null;
    try {
      const { data, error } = await supabase.rpc('place_ecom_order', {
        p_seller_id: sellerId,
        p_customer_name: name.trim(),
        p_customer_phone: phone.trim(),
        p_items: itemsPayload,
        p_total_price: total,
        p_city: city.trim() || null,
        p_notes: notes.trim() || null,
        p_customer_email: null,
        p_channel: waPhone ? 'whatsapp' : 'manual',
        p_member_code: memberCode.trim() || null,
        p_order_type: orderType,
        p_delivery_address: orderType === 'domicilio' ? deliveryAddress.trim() || null : null,
      });
      if (error) throw error;
      ref = data ? String(data).slice(-6).toUpperCase() : null;
    } catch (err: any) {
      setSubmitting(false);
      setErrorMsg(err?.message
        ? `No se pudo enviar: ${err.message}`
        : 'No se pudo enviar el pedido. Revisa tu conexión e intenta de nuevo.');
      return;
    }
    setOrderRef(ref);
    setSubmitting(false);
    setDone(true);
    onOrderPlaced();
    if (waPhone) window.open(buildWA(ref), '_blank');
  };

  // ── Pasarelas de pago activas (leídas de profile.payment_gateways) ──────────
  const rawGw = (profile as any).payment_gateways;
  const gwCfg: PaymentGatewaysConfig = (rawGw && !Array.isArray(rawGw)) ? rawGw : {};

  // Normaliza un número EC (0XXXXXXXXX → 593XXXXXXXXX) para wa.me
  const ecWa = (num: string) => {
    const d = (num || '').replace(/\D/g, '');
    return d.startsWith('0') ? '593' + d.slice(1) : d;
  };

  // PayPhone: invoca la Edge Function del comercio con el monto total
  const handlePayphone = async () => {
    if (payphoneBusy) return;
    setPayphoneBusy(true);
    setPayphoneMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('payphone_charge', {
        body: {
          token: gwCfg.payphone?.token ?? null,
          storeId: gwCfg.payphone?.storeId ?? null,
          amount: total,
          reference: orderRef,
          customer: name,
        },
      });
      if (error) throw error;
      const url = (data as any)?.url || (data as any)?.paymentUrl;
      if (url) { window.open(url, '_blank'); return; }
      throw new Error('sin_url');
    } catch {
      setPayphoneMsg('No se pudo iniciar el pago con PayPhone. Envía tu comprobante por WhatsApp o intenta otro método.');
    } finally {
      setPayphoneBusy(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1500);
    }).catch(() => {});
  };

  return (
    <>
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}>
      <div
        className="w-full sm:max-w-md bg-[#0b1219] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden animate-slide-up"
        style={{ maxHeight: '92svh', fontFamily: "'Space Grotesk', sans-serif" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <FaShoppingCart className="text-[#00e5a0]" /> Finalizar pedido
          </h2>
          <button onClick={onClose} className="text-white/50 hover:text-white transition p-1">
            <FaTimes className="w-4 h-4" />
          </button>
        </div>

        {done ? (
          <div className="flex-1 min-h-0 overflow-y-scroll p-6 text-center space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="text-5xl">✅</div>
            <h3 className="text-lg font-black text-white">¡Pedido enviado!</h3>
            <p className="text-sm text-white/60">
              {orderRef ? <>Tu pedido <span className="text-[#00e5a0] font-bold">#{orderRef}</span> fue recibido. </> : 'Tu pedido fue recibido. '}
              {profile.displayName} lo verá al instante.
            </p>
            {orderRef && onTrackOrder && (
              <button
                onClick={() => onTrackOrder(orderRef)}
                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-black bg-[#00e5a0] hover:bg-[#00cfa0] flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#00e5a0]/20"
              >
                <FaClock className="w-4 h-4" /> Rastrear mi pedido
              </button>
            )}

            {/* ── Opciones de pago activas ─────────────────────────────── */}
            {(() => {
              const hasAny = gwCfg.directLink?.enabled || gwCfg.payphone?.enabled || gwCfg.bankTransfer?.enabled || gwCfg.whatsapp?.enabled;
              const bt = gwCfg.bankTransfer;
              const proofPhone = gwCfg.whatsapp?.phone || waPhone;
              const proofMsg = `Hola ${profile.displayName}, te envío mi comprobante de pago del pedido #${orderRef ?? ''} por $${total.toFixed(2)}.`;
              return (
                <div className="space-y-2.5 text-left">
                  <p className="text-[11px] text-white/50 uppercase tracking-widest font-black text-center">Opciones de pago</p>

                  {/* Link Directo / Botón de Pago */}
                  {gwCfg.directLink?.enabled && gwCfg.directLink?.url?.trim() && (
                    <a href={`${gwCfg.directLink.url}${gwCfg.directLink.url.includes('?') ? '&' : '?'}amount=${total.toFixed(2)}${orderRef ? `&ref=${orderRef}` : ''}`}
                      target="_blank" rel="noopener noreferrer"
                      className="flex items-center justify-between w-full py-3 px-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#00e5a0]/40 transition-all active:scale-[0.98]">
                      <span className="text-sm font-bold text-white flex items-center gap-2"><FaLink className="text-[#00e5a0]" /> {gwCfg.directLink.name?.trim() || 'Pagar en línea'}</span>
                      <span className="text-[#00e5a0] text-xs font-black uppercase tracking-wider">Pagar →</span>
                    </a>
                  )}

                  {/* PayPhone / Pasarela API */}
                  {gwCfg.payphone?.enabled && (
                    <div className="space-y-1.5">
                      <button type="button" onClick={handlePayphone} disabled={payphoneBusy}
                        className="flex items-center justify-between w-full py-3 px-3.5 rounded-xl bg-white/5 border border-white/10 hover:border-[#00e5a0]/40 transition-all active:scale-[0.98] disabled:opacity-50">
                        <span className="text-sm font-bold text-white flex items-center gap-2"><FaMobileAlt className="text-[#00e5a0]" /> PayPhone</span>
                        <span className="text-[#00e5a0] text-xs font-black uppercase tracking-wider">{payphoneBusy ? '...' : 'Pagar →'}</span>
                      </button>
                      {payphoneMsg && <p className="text-[11px] text-amber-400/80 px-1">{payphoneMsg}</p>}
                    </div>
                  )}

                  {/* Transferencia Bancaria */}
                  {gwCfg.bankTransfer?.enabled && (bt?.bank || bt?.accountNumber) && (
                    <div className="bg-black/30 border border-white/10 rounded-xl p-3.5 space-y-1.5">
                      <p className="text-sm font-bold text-white flex items-center gap-2"><FaUniversity className="text-[#00e5a0]" /> Transferencia bancaria</p>
                      <div className="text-xs text-white/70 space-y-1 pt-1">
                        {bt?.bank && <div className="flex justify-between gap-2"><span className="text-white/40">Banco</span><span className="font-semibold text-white text-right">{bt.bank}</span></div>}
                        {bt?.accountType && <div className="flex justify-between gap-2"><span className="text-white/40">Tipo</span><span className="font-semibold text-white text-right">{bt.accountType}</span></div>}
                        {bt?.accountNumber && (
                          <div className="flex justify-between gap-2 items-center"><span className="text-white/40">N° cuenta</span>
                            <button type="button" onClick={() => copyToClipboard(bt.accountNumber!, 'acc')} className="font-mono font-semibold text-white text-right flex items-center gap-1.5 hover:text-[#00e5a0] transition">
                              {bt.accountNumber} <FaCopy className="text-[10px] opacity-60" />{copied === 'acc' && <span className="text-[10px] text-[#00e5a0]">¡Copiado!</span>}
                            </button>
                          </div>
                        )}
                        {bt?.holder && <div className="flex justify-between gap-2"><span className="text-white/40">Titular</span><span className="font-semibold text-white text-right">{bt.holder}</span></div>}
                        {bt?.idNumber && <div className="flex justify-between gap-2"><span className="text-white/40">Cédula/RUC</span><span className="font-semibold text-white text-right">{bt.idNumber}</span></div>}
                        {bt?.email && <div className="flex justify-between gap-2"><span className="text-white/40">Email</span><span className="font-semibold text-white text-right break-all">{bt.email}</span></div>}
                      </div>
                      {proofPhone && (
                        <a href={buildWALink(ecWa(proofPhone), proofMsg)} target="_blank" rel="noopener noreferrer"
                          className="mt-2 w-full py-2.5 rounded-xl font-black text-xs uppercase tracking-wider text-white bg-[#25D366] hover:bg-[#1ebe5d] flex items-center justify-center gap-2 transition-all active:scale-95">
                          <FaWhatsapp className="w-4 h-4" /> Enviar comprobante
                        </a>
                      )}
                    </div>
                  )}

                  {/* WhatsApp / Pago Manual */}
                  {gwCfg.whatsapp?.enabled && proofPhone && orderRef && (
                    <a href={buildWALink(ecWa(proofPhone), proofMsg)} target="_blank" rel="noopener noreferrer"
                      className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-white bg-[#25D366] hover:bg-[#1ebe5d] flex items-center justify-center gap-2 transition-all active:scale-95">
                      <FaWhatsapp className="w-4 h-4" /> Enviar comprobante de pago
                    </a>
                  )}

                  {/* Fallback: sin métodos configurados → comprobante por WhatsApp del perfil */}
                  {!hasAny && waPhone && orderRef && (
                    <a href={buildWALink(ecWa(waPhone), proofMsg)} target="_blank" rel="noopener noreferrer"
                      className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-white bg-[#25D366] hover:bg-[#1ebe5d] flex items-center justify-center gap-2 transition-all active:scale-95">
                      <FaWhatsapp className="w-4 h-4" /> Enviar comprobante de pago
                    </a>
                  )}
                </div>
              );
            })()}

            {orderRef && !invoiceDone && (
              <button
                onClick={() => setShowInvoice(true)}
                className="w-full py-3 rounded-xl font-bold text-sm text-white/60 bg-white/5 border border-white/10 hover:border-[#00e5a0]/30 hover:text-white/80 transition-all active:scale-95"
              >
                🧾 ¿Necesitas factura?
              </button>
            )}
            {invoiceDone && (
              <p className="text-xs text-[#00e5a0] text-center font-bold">✅ Datos de factura enviados</p>
            )}
            <button onClick={onClose} className="w-full py-2 text-xs text-white/40 hover:text-white/70 transition">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-scroll p-5 space-y-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Tipo de entrega */}
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Tipo de entrega</label>
              <div className="flex gap-2 mt-1.5">
                <button type="button"
                  onClick={() => setOrderType('local')}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition-all ${
                    orderType === 'local' ? 'bg-[#00e5a0] border-[#00e5a0] text-black' : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
                  }`}>
                  🏪 Retirar en local
                </button>
                <button type="button"
                  onClick={() => setOrderType('domicilio')}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-black border transition-all ${
                    orderType === 'domicilio' ? 'bg-[#00e5a0] border-[#00e5a0] text-black' : 'bg-white/5 border-white/10 text-white/60 hover:border-white/20'
                  }`}>
                  🚚 Domicilio
                </button>
              </div>
              {orderType === 'domicilio' && (
                <input
                  required
                  type="text"
                  value={deliveryAddress}
                  onChange={e => setDeliveryAddress(e.target.value)}
                  placeholder="Dirección completa de entrega *"
                  className="mt-2 w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25"
                />
              )}
            </div>

            {/* Resumen */}
            <div className="bg-black/30 rounded-xl p-3.5 border border-white/5 space-y-1.5">
              {items.map(i => (
                <div key={i.product.id + (i.selectedExtras?.map(e=>e.optionId).join('') ?? '')} className="flex justify-between text-xs gap-2">
                  <span className="text-white/80 flex-1 min-w-0">
                    <span className="text-[#00e5a0] font-bold">{i.quantity}x</span> {i.product.name}
                    {i.selectedExtras && i.selectedExtras.length > 0 && (
                      <span className="block text-[10px] text-white/35 truncate">{i.selectedExtras.map(e => e.optionLabel).join(', ')}</span>
                    )}
                  </span>
                  <span className="text-white/50 font-mono shrink-0">
                    {i.tierUnitPrice != null
                      ? `$${i.tierUnitPrice.toFixed(2)}/u${i.extrasUnitPrice ? ` +$${i.extrasUnitPrice.toFixed(2)}` : ''}`
                      : `${i.product.price ?? '—'}${i.extrasUnitPrice ? ` +$${i.extrasUnitPrice.toFixed(2)}` : ''}`
                    }
                  </span>
                </div>
              ))}
              {memberDiscount > 0 && (
                <div className="flex justify-between text-xs text-[#00e5a0]">
                  <span>Descuento miembro ({memberDiscount}%)</span>
                  <span className="font-mono">-${discountAmount.toFixed(2)}</span>
                </div>
              )}
              {deliveryFeeAmount > 0 && (
                <div className="flex justify-between text-xs text-white/60">
                  <span>Envío a domicilio</span>
                  <span className="font-mono">+${deliveryFeeAmount.toFixed(2)}</span>
                </div>
              )}
              {orderType === 'domicilio' && deliveryFeeAmount === 0 && (
                <div className="flex justify-between text-xs text-[#00e5a0]/60">
                  <span>Envío</span>
                  <span className="font-mono font-black">Gratis</span>
                </div>
              )}
              <div className="border-t border-white/5 pt-2 flex justify-between items-center">
                <span className="text-[10px] text-white/30 uppercase tracking-widest">Total ({itemCount})</span>
                <span className="text-white font-black font-mono">${total.toFixed(2)}</span>
              </div>
            </div>

            {/* Código de miembro */}
            <div>
              <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Código de miembro (opcional)</label>
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  value={memberCode}
                  onChange={e => { setMemberCode(e.target.value.toUpperCase()); setMemberDiscount(0); setLookupMsg(null); }}
                  placeholder="E-XXXX"
                  className="flex-1 bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25 font-mono"
                />
                <button type="button" onClick={handleLookupMember} disabled={lookingUp || !memberCode.trim()}
                  className="px-3 py-2.5 rounded-xl bg-[#00e5a0]/15 border border-[#00e5a0]/25 text-[#00e5a0] text-xs font-black uppercase tracking-wider disabled:opacity-40 transition-all hover:bg-[#00e5a0]/25">
                  {lookingUp ? '...' : 'Aplicar'}
                </button>
              </div>
              {lookupMsg && (
                <p className={`text-xs mt-1.5 font-bold ${lookupMsg.startsWith('✅') ? 'text-[#00e5a0]' : 'text-red-400'}`}>
                  {lookupMsg}
                </p>
              )}
            </div>

            {/* Datos del cliente */}
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Nombre *</label>
                <input required type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre"
                  className="mt-1 w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25" />
              </div>
              <div>
                <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">WhatsApp / Teléfono *</label>
                <input required type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="Ej. +57 300 123 4567"
                  className="mt-1 w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25" />
              </div>
              <div>
                <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Ciudad</label>
                <input type="text" value={city} onChange={e => setCity(e.target.value)} placeholder="Ej. Bogotá"
                  className="mt-1 w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25" />
              </div>
              <div>
                <label className="text-[11px] text-white/50 uppercase tracking-widest font-bold">Notas (opcional)</label>
                <textarea value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="Dirección, referencias, color/talla, etc." rows={2}
                  className="mt-1 w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#00e5a0]/50 placeholder-white/25 resize-none" />
              </div>
            </div>

          </div>
          <div className="shrink-0 px-5 pb-5 pt-3 space-y-2 border-t border-white/5 bg-[#0b1219]">
            {errorMsg && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold text-center">{errorMsg}</div>
            )}
            <button type="submit" disabled={submitting || !name.trim() || !phone.trim()}
              className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-black bg-[#00e5a0] hover:bg-[#00cfa0] disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-[#00e5a0]/20">
              {submitting ? 'Enviando...' : <>Enviar pedido · ${total.toFixed(2)}</>}
            </button>
            <p className="text-[10px] text-white/25 text-center">{profile.displayName} recibirá tu pedido al instante.</p>
          </div>
          </form>
        )}
      </div>
    </div>
    {showInvoice && orderRef && (
      <EcomInvoiceModal
        sellerId={sellerId}
        orderCode={orderRef}
        prefillName={name}
        prefillPhone={phone}
        memberCode={memberCode}
        profile={profile}
        onClose={() => setShowInvoice(false)}
        onDone={() => { setShowInvoice(false); setInvoiceDone(true); }}
      />
    )}
    </>
  );
};

// ─── Main Template ────────────────────────────────────────────────────────────

// ─── Agendamiento de citas (motor propio ecom_staff / ecom_appointments) ──────
// El cliente elige productos/servicios del catálogo, con quién quiere ser
// atendido, la fecha y una franja libre de ESE vendedor (sin cruces), responde
// el formulario que el dueño armó a medida y recibe un código de cita.

const pad2 = (n: number) => String(n).padStart(2, '0');

// Genera la grilla de horas de un día según el horario y la duración de cita.
const genSlots = (openTime: string, closeTime: string, stepMin: number): string[] => {
  const [oh, om] = (openTime || '09:00').split(':').map(Number);
  const [ch, cm] = (closeTime || '18:00').split(':').map(Number);
  const step = Math.max(5, stepMin || 30);
  let cur = oh * 60 + om;
  const end = ch * 60 + cm;
  const out: string[] = [];
  while (cur < end) { out.push(`${pad2(Math.floor(cur / 60))}:${pad2(cur % 60)}`); cur += step; }
  return out;
};

interface EcomAppointmentModalProps {
  profile: Profile;
  sellerId: string | null;
  staff: EcomStaff[];
  accent: string;
  isMobilePreview?: boolean;
  onClose: () => void;
}

const EcomAppointmentModal: React.FC<EcomAppointmentModalProps> = ({
  profile, sellerId, staff, accent, isMobilePreview, onClose,
}) => {
  const catalog: Product[] = Array.isArray(profile.products)
    ? (profile.products as any[]).filter(p => p.available !== false)
    : [];
  const customFields: EcomBookingField[] = Array.isArray(profile.ecom_booking_form)
    ? profile.ecom_booking_form
    : [];

  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [showCatalog, setShowCatalog] = useState(false);
  const [selStaff, setSelStaff] = useState<EcomStaff | null>(staff.length === 1 ? staff[0] : null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [taken, setTaken] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [memberCode, setMemberCode] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const today = new Date().toISOString().slice(0, 10);
  const maxDate = (() => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10); })();

  // Horario del vendedor elegido para el día elegido
  const dayHours = React.useMemo(() => {
    if (!selStaff || !date) return null;
    const dow = new Date(date + 'T00:00:00').getDay();
    const hrs = Array.isArray(selStaff.working_hours) ? selStaff.working_hours : [];
    return hrs.find(h => h.day === dow) || null;
  }, [selStaff, date]);

  // Franjas disponibles = generadas − ocupadas − pasadas (si la fecha es hoy)
  const slots = React.useMemo(() => {
    if (!dayHours || !dayHours.isOpen) return [];
    let all = genSlots(dayHours.openTime, dayHours.closeTime, selStaff?.slot_minutes || 30)
      .filter(s => !taken.includes(s));
    if (date === today) {
      const now = new Date();
      const cur = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
      all = all.filter(s => s > cur);
    }
    return all;
  }, [dayHours, taken, date, today, selStaff]);

  // Al elegir vendedor + fecha, traemos las franjas YA tomadas de ese vendedor
  useEffect(() => {
    setTime('');
    if (!selStaff || !date || !sellerId) { setTaken([]); return; }
    let cancelled = false;
    setLoadingSlots(true);
    supabase.rpc('get_ecom_staff_availability', {
      p_seller_id: sellerId, p_staff_id: selStaff.id, p_date: date,
    })
      .then(({ data }) => {
        if (cancelled) return;
        const t = (data as any)?.taken;
        setTaken(Array.isArray(t) ? t : []);
      })
      .then(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [selStaff, date, sellerId]);

  const selectedItems = catalog.filter(p => picked[p.id]);

  // El formulario del negocio MANDA: si el dueño ya pide nombre / teléfono /
  // email / comentarios entre sus campos, no volvemos a pedirlos abajo (era la
  // causa del "formulario repetido"). Solo rellenamos lo que falte.
  const mapped = React.useMemo(() => {
    const used = new Set<string>();
    const pick = (test: (f: EcomBookingField) => boolean) => {
      const f = customFields.find(x => !used.has(x.id) && test(x));
      if (f) used.add(f.id);
      return f || null;
    };
    const phoneField = pick(f => f.type === 'tel')
                    || pick(f => /tel[ée]fono|whats|celular|m[óo]vil/i.test(f.label));
    const emailField = pick(f => f.type === 'email')
                    || pick(f => /correo|e-?mail/i.test(f.label));
    // "Nombre de tu empresa" o "Nombre de tu mascota" NO son el nombre del cliente.
    const nameField  = pick(f => /nombre|name/i.test(f.label)
                              && !/empresa|negocio|compa[ñn]|marca|mascota|producto|proyecto/i.test(f.label)
                              && (f.type === 'text' || f.type === 'textarea'));
    // Un campo de fecha del dueño ES la fecha de la cita: se fusiona con el
    // selector base (que es el que carga las horas libres) en vez de duplicarlo.
    // "Fecha de nacimiento" se deja como campo normal, no es la fecha de la cita.
    const dateField  = pick(f => f.type === 'date'
                              && !/nacimiento|cumplea|nacim/i.test(f.label));
    const notesField = pick(f => f.type === 'textarea');
    return { nameField, phoneField, emailField, dateField, notesField };
  }, [customFields]);

  // Valor efectivo de cada dato: el del campo del dueño si existe, si no el
  // del bloque base. Estos son los que viajan a las columnas de la cita.
  const answerOf = (f: EcomBookingField | null) => (f ? String(answers[f.id] ?? '').trim() : '');
  const effName  = mapped.nameField  ? answerOf(mapped.nameField)  : name.trim();
  const effPhone = mapped.phoneField ? answerOf(mapped.phoneField) : phone.trim();
  const effEmail = mapped.emailField ? answerOf(mapped.emailField) : email.trim();
  // Si el dueño ya tiene un campo de texto largo, ese ocupa el lugar de
  // "¿algo más?" (ocultamos el nuestro) pero su respuesta se queda en el
  // formulario CON su etiqueta, para no perder el contexto en el panel.
  const effNotes = mapped.notesField ? '' : notes.trim();

  // Respuestas del formulario del dueño, con su etiqueta. Se calcula UNA sola
  // vez y se usa en dos lugares: lo que se guarda en la cita y lo que el
  // cliente ve en su recibo. Antes el recibo no las mostraba, así que el
  // cliente no veía lo que acababa de responder (ej. "¿Qué perfil de Connexo
  // te interesa?"). Se excluyen los campos que ya viajan en su propia columna
  // (nombre/teléfono/email/fecha) para no repetir el dato.
  const formAnswers = React.useMemo(
    () => customFields
      .filter(f => f.id !== mapped.nameField?.id && f.id !== mapped.phoneField?.id
                && f.id !== mapped.emailField?.id && f.id !== mapped.dateField?.id)
      .map(f => ({ id: f.id, label: f.label, value: String(answers[f.id] ?? '').trim() }))
      .filter(a => a.value !== ''),
    [customFields, mapped, answers],
  );

  const canSubmit = !!(selStaff && date && time && effName);

  const handleSubmit = async () => {
    if (!canSubmit) { setError('Elige quién te atiende, la fecha, la hora y escribe tu nombre.'); return; }
    // El nombre es obligatorio aunque el dueño no lo haya marcado como tal:
    // sin él la cita no se puede identificar en el panel.
    if (!effName) { setError('Escribe tu nombre para agendar.'); return; }
    if (isMobilePreview) { setError('Desactivado en la vista previa.'); return; }
    if (!sellerId) { setError('Perfil no disponible.'); return; }

    // Campos personalizados obligatorios
    // El campo de fecha del dueño lo cubre el selector base (ya validado como
    // obligatorio en canSubmit); si no se excluye aquí, bloquearía el envío.
    const missing = customFields.find(f => f.id !== mapped.dateField?.id
      && f.required && !String(answers[f.id] ?? '').trim());
    if (missing) { setError(`Completa "${missing.label}".`); return; }

    setSubmitting(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('place_ecom_appointment', {
        p_seller_id: sellerId,
        p_staff_id: selStaff!.id,
        p_name: effName,
        p_phone: effPhone || null,
        p_email: effEmail || null,
        p_date: date,
        p_time: time,
        p_items: selectedItems.map(p => ({ id: p.id, name: p.name, price: p.price || '' })),
        p_notes: effNotes || null,
        p_member_code: memberCode.trim() || null,
        // Guardamos la etiqueta junto al valor: la cita sigue siendo legible
        // aunque el dueño cambie el formulario más adelante. Los campos que ya
        // viajan en su propia columna (nombre/teléfono/email/comentarios) no se
        // repiten aquí, para que el panel no muestre el dato dos veces.
        p_form: formAnswers,
      });
      if (rpcError) { setError('No pudimos agendar. Intenta de nuevo.'); return; }
      if (!(data as any)?.ok) {
        const code = (data as any)?.error;
        setError(
          code === 'slot_taken'        ? 'Esa hora se acaba de ocupar. Elige otra.'
          : code === 'staff_unavailable' ? 'Esa persona ya no está disponible.'
          : code === 'staff_closed'      ? 'No atiende ese día. Elige otra fecha.'
          : code === 'outside_hours'     ? 'Esa hora está fuera del horario de atención.'
          : code === 'past_date'         ? 'Esa fecha ya pasó.'
          : 'No pudimos agendar. Revisa los datos.'
        );
        if (code === 'slot_taken') {
          setTime('');
          // Refrescamos la disponibilidad para que no vuelva a elegir esa hora
          supabase.rpc('get_ecom_staff_availability', {
            p_seller_id: sellerId, p_staff_id: selStaff!.id, p_date: date,
          }).then(({ data: d }) => {
            const t = (d as any)?.taken;
            setTaken(Array.isArray(t) ? t : []);
          });
        }
        return;
      }
      setResult(data);
    } catch {
      setError('Ocurrió un error. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#00e5a0]/50";
  const labelCls = "block text-[10px] uppercase tracking-widest font-bold mb-2";

  const renderField = (f: EcomBookingField) => {
    const val = answers[f.id] ?? '';
    const set = (v: string) => setAnswers(prev => ({ ...prev, [f.id]: v }));
    if (f.type === 'textarea') {
      return <textarea value={val} onChange={e => set(e.target.value)} rows={3}
        placeholder={f.placeholder || ''} className={`${inputCls} resize-none`} />;
    }
    if (f.type === 'select') {
      return (
        <div className="flex flex-wrap gap-2">
          {(f.options || []).map(opt => (
            <button key={opt} type="button" onClick={() => set(val === opt ? '' : opt)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                val === opt ? 'text-black' : 'bg-white/5 text-white/70 border-white/10 hover:border-[#00e5a0]/40'
              }`}
              style={val === opt ? { backgroundColor: accent, borderColor: accent } : undefined}>
              {opt}
            </button>
          ))}
        </div>
      );
    }
    if (f.type === 'checkbox') {
      const on = val === 'Sí';
      return (
        <button type="button" onClick={() => set(on ? 'No' : 'Sí')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition ${
            on ? 'text-black' : 'bg-white/5 text-white/60 border-white/10'
          }`}
          style={on ? { backgroundColor: accent, borderColor: accent } : undefined}>
          <FaCheck size={10} /> {on ? 'Sí' : 'No'}
        </button>
      );
    }
    return (
      <input
        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'tel' ? 'tel' : f.type === 'email' ? 'email' : 'text'}
        value={val} onChange={e => set(e.target.value)}
        placeholder={f.placeholder || ''} className={inputCls}
      />
    );
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0b1219] border border-[#00e5a0]/20 w-full max-w-md rounded-2xl shadow-2xl relative text-white overflow-hidden max-h-[92svh] flex flex-col"
        onClick={e => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        {/* Header */}
        <div className="relative p-6 pb-4 border-b border-white/5 shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition"><FaTimes /></button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl" style={{ backgroundColor: `${accent}26` }}>📅</div>
            <div>
              <h3 className="font-black uppercase tracking-wider text-sm" style={{ color: accent }}>Agendar una cita</h3>
              <p className="text-[11px] text-white/40">Elige qué necesitas, con quién y cuándo</p>
            </div>
          </div>
        </div>

        {result ? (
          <div className="p-6 text-center space-y-4 overflow-y-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl flex items-center justify-center text-3xl" style={{ backgroundColor: `${accent}26` }}>✅</div>
            <div>
              <h4 className="font-black text-white text-base">¡Cita agendada!</h4>
              <p className="text-xs text-white/50 mt-1">Te esperamos, {effName.split(' ')[0]}.</p>
            </div>
            <div className="bg-black/60 rounded-2xl px-6 py-5 border text-center" style={{ borderColor: `${accent}4d` }}>
              <p className="text-[10px] uppercase tracking-[3px] mb-2" style={{ color: `${accent}99` }}>Tu código de cita</p>
              <p className="text-3xl font-black tracking-[4px] mb-1" style={{ color: accent }}>{result.confirmation_code}</p>
              <p className="text-[10px] text-white/30 leading-relaxed">Guárdalo para consultar el estado de tu cita.</p>
            </div>
            <div className="border rounded-xl px-4 py-3 text-left text-xs text-white/70 space-y-1"
              style={{ backgroundColor: `${accent}0d`, borderColor: `${accent}26` }}>
              {result.staff_name && <p><span className="text-white/40">Te atiende:</span> {result.staff_name}</p>}
              <p><span className="text-white/40">Fecha:</span> {new Date(date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
              <p><span className="text-white/40">Hora:</span> {time}</p>
              {selectedItems.length > 0 && (
                <p><span className="text-white/40">Te interesa:</span> {selectedItems.map(p => p.name).join(', ')}</p>
              )}
              {/* Lo que el cliente respondió en el formulario del negocio */}
              {formAnswers.map(a => (
                <p key={a.id}><span className="text-white/40">{a.label}:</span> {a.value}</p>
              ))}
            </div>
            <button onClick={onClose}
              className="w-full py-3 rounded-xl text-black font-black text-sm uppercase tracking-wider active:scale-95 transition-all"
              style={{ backgroundColor: accent }}>
              ¡Perfecto!
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-5 overflow-y-auto">
            {/* 1· Qué te interesa (catálogo) — tarjetas con imagen */}
            {catalog.length > 0 && (
              <div>
                <div className="flex items-baseline justify-between mb-2.5">
                  <label className="block text-[10px] uppercase tracking-widest font-bold" style={{ color: `${accent}b3` }}>¿Qué te interesa?</label>
                  {selectedItems.length > 0 ? (
                    <span className="text-[10px] font-bold" style={{ color: accent }}>
                      {selectedItems.length} seleccionado{selectedItems.length !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-[10px] text-white/30">Opcional</span>
                  )}
                </div>
                {/* Lo ya elegido, en compacto (con quitar) */}
                {selectedItems.length > 0 && (
                  <div className="space-y-1.5 mb-2.5">
                    {selectedItems.map(p => (
                      <div key={p.id} className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] border border-white/10 p-1.5 pr-2">
                        <div className="w-9 h-9 rounded-lg overflow-hidden bg-black/40 shrink-0">
                          {p.imageURL
                            ? <img src={p.imageURL} alt={p.name} className="w-full h-full object-cover" />
                            : <div className="w-full h-full flex items-center justify-center text-sm text-white/20">🛍️</div>}
                        </div>
                        <p className="flex-1 min-w-0 text-[11px] font-bold text-white truncate">{p.name}</p>
                        {p.price && <span className="text-[11px] font-black shrink-0" style={{ color: accent }}>{p.price}</span>}
                        <button type="button" title="Quitar"
                          onClick={() => setPicked(prev => ({ ...prev, [p.id]: false }))}
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 transition shrink-0">
                          <FaTimes className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* El catálogo vive detrás de este botón: no una lista infinita */}
                <button type="button" onClick={() => setShowCatalog(v => !v)}
                  className={`w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider border border-dashed transition-all flex items-center justify-center gap-2 ${
                    showCatalog ? 'text-black border-transparent' : 'text-white/60 border-white/20 hover:text-white hover:border-white/35'
                  }`}
                  style={showCatalog ? { backgroundColor: accent } : undefined}>
                  {showCatalog
                    ? <>Listo</>
                    : <><FaPlus className="w-2.5 h-2.5" /> {selectedItems.length > 0 ? 'Añadir otro producto' : 'Añadir producto'}</>}
                </button>

                {showCatalog && (
                <div className="grid grid-cols-2 gap-2.5 mt-2.5 max-h-72 overflow-y-auto pr-0.5">
                  {catalog.map(p => {
                    const on = !!picked[p.id];
                    return (
                      <button key={p.id} type="button"
                        onClick={() => setPicked(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                        className={`group relative text-left rounded-xl overflow-hidden border transition-all ${
                          on ? 'bg-white/[0.07] shadow-lg' : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                        }`}
                        style={on ? { borderColor: accent, boxShadow: `0 0 0 1px ${accent}66` } : undefined}>
                        <div className="relative w-full aspect-[4/3] overflow-hidden bg-black/40">
                          {p.imageURL ? (
                            <img src={p.imageURL} alt={p.name}
                              className={`w-full h-full object-cover transition-transform duration-300 ${on ? 'scale-105' : 'group-hover:scale-105'}`} />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl text-white/15">🛍️</div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
                          {/* Marca de selección */}
                          <div className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-full flex items-center justify-center border transition-all ${
                            on ? 'scale-100' : 'scale-90 border-white/25 bg-black/40'
                          }`}
                            style={on ? { backgroundColor: accent, borderColor: accent } : undefined}>
                            {on && <FaCheck className="w-2.5 h-2.5 text-black" />}
                          </div>
                          {p.price && (
                            <span className="absolute bottom-1.5 left-2 text-[11px] font-black text-white drop-shadow">
                              {p.price}
                            </span>
                          )}
                        </div>
                        <div className="px-2.5 py-2">
                          <p className={`text-[11px] font-bold leading-tight line-clamp-2 ${on ? 'text-white' : 'text-white/70'}`}>
                            {p.name}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                )}
              </div>
            )}

            {/* 2· Con quién */}
            <div>
              <label className={labelCls} style={{ color: `${accent}b3` }}>¿Quién te atiende?</label>
              <div className="grid grid-cols-3 gap-2">
                {staff.map(s => {
                  const on = selStaff?.id === s.id;
                  return (
                    <button key={s.id} type="button" onClick={() => setSelStaff(s)}
                      className={`rounded-xl p-2.5 border text-center transition ${
                        on ? 'bg-white/10' : 'bg-white/5 border-white/10 hover:border-[#00e5a0]/40'
                      }`}
                      style={on ? { borderColor: accent } : undefined}>
                      {s.photo_url ? (
                        <img src={s.photo_url} alt={s.name} className="w-12 h-12 rounded-full object-cover mx-auto mb-1.5 border border-white/10" />
                      ) : (
                        <div className="w-12 h-12 rounded-full mx-auto mb-1.5 flex items-center justify-center text-lg"
                          style={{ backgroundColor: `${accent}1a`, color: accent }}>👤</div>
                      )}
                      <p className="text-[11px] font-bold text-white leading-tight truncate">{s.name}</p>
                      {s.role && <p className="text-[9px] text-white/40 truncate mt-0.5">{s.role}</p>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3· Fecha — si el dueño puso su propio campo de fecha, usamos su
                   etiqueta aquí en vez de dibujar dos selectores de fecha. */}
            <div>
              <label className={labelCls} style={{ color: `${accent}b3` }}>
                {mapped.dateField?.label || 'Fecha'}
              </label>
              <input type="date" value={date} min={today} max={maxDate}
                onChange={e => setDate(e.target.value)}
                disabled={!selStaff}
                className={`${inputCls} disabled:opacity-40`} />
              {!selStaff && <p className="text-[11px] text-white/30 mt-1.5">Primero elige quién te atiende.</p>}
            </div>

            {/* 4· Hora */}
            {selStaff && date && (
              <div>
                <label className={labelCls} style={{ color: `${accent}b3` }}>Hora disponible</label>
                {loadingSlots ? (
                  <p className="text-xs text-white/40">Buscando horas libres...</p>
                ) : !dayHours || !dayHours.isOpen ? (
                  <p className="text-xs text-amber-300/80">{selStaff.name} no atiende ese día. Elige otra fecha.</p>
                ) : slots.length === 0 ? (
                  <p className="text-xs text-amber-300/80">No quedan horas libres ese día. Prueba con otra fecha.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map(s => {
                      const on = time === s;
                      return (
                        <button key={s} type="button" onClick={() => setTime(s)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                            on ? 'text-black' : 'bg-white/5 text-white/70 border-white/10 hover:border-[#00e5a0]/40'
                          }`}
                          style={on ? { backgroundColor: accent, borderColor: accent } : undefined}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 5· Formulario personalizado del negocio */}
            {customFields.some(f => f.id !== mapped.dateField?.id) && (
              <div className="space-y-4 pt-1 border-t border-white/5">
                {customFields.filter(f => f.id !== mapped.dateField?.id).map(f => (
                  <div key={f.id}>
                    <label className={labelCls} style={{ color: `${accent}b3` }}>
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    {renderField(f)}
                  </div>
                ))}
              </div>
            )}

            {/* 6· Tus datos — SOLO lo que el formulario del negocio no pide ya.
                   El código de miembro se muestra siempre. */}
            <div className="space-y-3 pt-1 border-t border-white/5">
              {!mapped.nameField && (
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre *" className={inputCls} />
              )}
              {!mapped.phoneField && (
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Tu teléfono / WhatsApp" type="tel" className={inputCls} />
              )}
              {!mapped.emailField && (
                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Tu email (opcional)" type="email" className={inputCls} />
              )}
              {!mapped.notesField && (
                <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  placeholder="¿Algo más que debamos saber? (opcional)" className={`${inputCls} resize-none`} />
              )}
              <input value={memberCode} onChange={e => setMemberCode(e.target.value.toUpperCase())}
                placeholder="Código de cliente (si tienes)" className={inputCls} />
            </div>

            {error && <p className="text-xs text-red-400 text-center">{error}</p>}

            <button onClick={handleSubmit} disabled={!canSubmit || submitting}
              className="w-full py-3.5 rounded-xl text-black font-black text-sm uppercase tracking-wider disabled:opacity-40 active:scale-95 transition-all"
              style={{ backgroundColor: accent }}>
              {submitting ? 'Agendando...' : 'Confirmar cita'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Consulta del estado de una cita por código ───────────────────────────────
const ECOM_APPT_STATUS: Record<string, { label: string; emoji: string }> = {
  pendiente:  { label: 'Pendiente de confirmar', emoji: '⏳' },
  confirmada: { label: 'Confirmada',             emoji: '✅' },
  completada: { label: 'Atendida',               emoji: '🎉' },
  cancelada:  { label: 'Cancelada',              emoji: '❌' },
  no_show:    { label: 'No asististe',           emoji: '⚠️' },
};

interface EcomAppointmentLookupProps {
  sellerId: string | null;
  accent: string;
  onClose: () => void;
}

const EcomAppointmentLookup: React.FC<EcomAppointmentLookupProps> = ({ sellerId, accent, onClose }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const lookup = async () => {
    if (!code.trim() || !sellerId) return;
    setLoading(true); setNotFound(false); setData(null);
    try {
      const { data: res } = await supabase.rpc('get_ecom_appointment_status', {
        p_seller_id: sellerId, p_code: code.trim().toUpperCase(),
      });
      if ((res as any)?.found) setData(res); else setNotFound(true);
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  const meta = data ? (ECOM_APPT_STATUS[data.status] || ECOM_APPT_STATUS.pendiente) : null;
  const items = Array.isArray(data?.items) ? data.items : [];

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0b1219] border border-[#00e5a0]/20 w-full max-w-sm rounded-2xl shadow-2xl relative text-white overflow-hidden max-h-[92svh] overflow-y-auto"
        onClick={e => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <div className="relative p-6 pb-4 border-b border-white/5">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition"><FaTimes /></button>
          <h3 className="font-black uppercase tracking-wider text-sm" style={{ color: accent }}>Consultar mi cita</h3>
          <p className="text-[11px] text-white/40 mt-1">Ingresa el código que recibiste al agendar</p>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="Ej. K7M2PQ"
              className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 tracking-[3px] font-bold focus:outline-none focus:border-[#00e5a0]/50" />
            <button onClick={lookup} disabled={loading || !code.trim()}
              className="px-4 rounded-xl text-black font-black text-xs uppercase tracking-wider disabled:opacity-40 transition-all"
              style={{ backgroundColor: accent }}>
              {loading ? '...' : 'Ver'}
            </button>
          </div>

          {notFound && (
            <p className="text-xs text-amber-300/80 text-center">
              No encontramos ninguna cita con ese código.
            </p>
          )}

          {data && meta && (
            <div className="space-y-3">
              <div className="rounded-2xl border p-5 text-center" style={{ backgroundColor: `${accent}0d`, borderColor: `${accent}33` }}>
                <div className="text-3xl mb-1">{meta.emoji}</div>
                <p className="font-black text-white text-sm">{meta.label}</p>
              </div>
              <div className="bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-xs text-white/70 space-y-1.5">
                <p><span className="text-white/40">A nombre de:</span> {data.customer_name}</p>
                {data.staff_name && <p><span className="text-white/40">Te atiende:</span> {data.staff_name}</p>}
                <p><span className="text-white/40">Fecha:</span> {new Date(data.appointment_date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
                <p><span className="text-white/40">Hora:</span> {data.appointment_time}</p>
                {items.length > 0 && (
                  <p><span className="text-white/40">Te interesa:</span> {items.map((i: any) => i.name).join(', ')}</p>
                )}
                {/* Respuestas del formulario del negocio. Sale solo si el RPC
                    las devuelve, para no romper si aún corre la versión vieja. */}
                {(Array.isArray(data?.form_data) ? data.form_data : []).map((a: any, i: number) => (
                  a?.value ? (
                    <p key={a.id || i}><span className="text-white/40">{a.label}:</span> {a.value}</p>
                  ) : null
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const ProfileEcomTemplate: React.FC<ProfileEcomTemplateProps> = ({
  profile,
  links,
  onLinkClick,
  onOpenLeadForm,
  onLeaveTestimonial,
  isMobilePreview = false,
  currentUser,
  visitorProfile,
  userId,
  downloadVCard,
  handleShare,
  setShowQRModal,
  isVCardLoading = false,
  handleStartChat,
  isStartingChat = false,
}) => {
  const plan = (profile.plan ?? 'free').toLowerCase();
  const isProOrUltra = plan === 'pro' || plan === 'ultra';
  const isUltra = plan === 'ultra';
  const sectionOn = (k: string) => (profile as any)?.sectionVisibility?.[k] !== false;
  const accent = (profile?.buttonColor && String(profile.buttonColor).trim()) || '#00e5a0';

  const [cart, dispatchCart] = useReducer(cartReducer, { items: [], isOpen: false });
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedAlbum, setSelectedAlbum] = useState<any | null>(null);
  // Visor de la galería: las fotos se dibujaban sin manejador de clic y al
  // tocarlas no pasaba nada, ni en la rejilla ni dentro de un álbum.
  const [visor, setVisor] = useState<{ images: string[]; index: number } | null>(null);
  const productScrollRef = useRef<HTMLDivElement>(null);
  const scrollProducts = (dir: 'prev' | 'next') => {
    const el = productScrollRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.85, 200);
    el.scrollBy({ left: dir === 'next' ? amount : -amount, behavior: 'smooth' });
  };
  const [checkoutItems, setCheckoutItems] = useState<EcomCartItem[] | null>(null);
  const [checkoutMemberCode, setCheckoutMemberCode] = useState('');

  // Club modals
  const [showClubModal, setShowClubModal] = useState(false);
  const [showLookupModal, setShowLookupModal] = useState(false);

  // Order tracker
  const [showTracker, setShowTracker] = useState(false);
  const [trackCode, setTrackCode] = useState<string | null>(null);

  // Citas (motor ecom_staff / ecom_appointments)
  const [apptStaff, setApptStaff] = useState<EcomStaff[]>([]);
  const [showAppointment, setShowAppointment] = useState(false);
  const [showApptLookup, setShowApptLookup] = useState(false);

  const foundUserId = userId ?? null;

  // Equipo de vendedores activos. Si no hay ninguno, la sección de citas
  // simplemente no aparece (el dueño la habilita agregando vendedores).
  useEffect(() => {
    if (!foundUserId || !isProOrUltra) { setApptStaff([]); return; }
    let cancelled = false;
    supabase.from('ecom_staff')
      .select('id, name, role, photo_url, working_hours, slot_minutes, is_active, sort_order')
      .eq('seller_id', foundUserId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        // Si la tabla aún no existe (SQL sin ejecutar) fallamos en silencio:
        // el perfil sigue funcionando igual, solo sin la sección de citas.
        if (cancelled || error) return;
        setApptStaff((data as EcomStaff[]) || []);
      });
    return () => { cancelled = true; };
  }, [foundUserId, isProOrUltra]);

  // Deep-link: ?pedido=CODIGO abre el rastreador automáticamente
  useEffect(() => {
    if (isMobilePreview) return;
    const params = new URLSearchParams(window.location.search);
    const pedido = params.get('pedido');
    if (pedido) {
      setTrackCode(pedido.trim().toUpperCase());
      setShowTracker(true);
    }
  }, [isMobilePreview]);

  const handleCheckout = useCallback((items: EcomCartItem[], memberCode = '') => {
    if (!items || items.length === 0) return;
    setSelectedProduct(null);
    dispatchCart({ type: 'CLOSE' });
    setCheckoutMemberCode(memberCode);
    setCheckoutItems(items);
  }, []);

  const handleShareCatalog = useCallback(async () => {
    const url = window.location.href;
    const shareData = {
      title: `${profile.displayName} — Catálogo Oficial`,
      text: `Compra directa sin intermediarios. Visita el catálogo de ${profile.displayName}.`,
      url,
    };
    if (navigator.share) {
      try { await navigator.share(shareData); } catch (_) {}
    } else {
      try { await navigator.clipboard.writeText(url); alert('¡Enlace del catálogo copiado!'); } catch (_) {}
    }
  }, [profile.displayName]);

  const products: Product[] = Array.isArray(profile.products) ? (profile.products as Product[]) : [];

  // ── Buscador del catálogo (debounce) + filtro por categoría ──────────────
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogCat, setCatalogCat] = useState('__all__');
  const debouncedCatalogQuery = useDebouncedValue(catalogQuery, 220);

  const searchedProducts = React.useMemo(
    () => filterCatalog(products, debouncedCatalogQuery),
    [products, debouncedCatalogQuery],
  );
  const catalogCounts = React.useMemo(() => countByCategory(searchedProducts), [searchedProducts]);
  const catalogCategories = React.useMemo(() => Object.keys(catalogCounts), [catalogCounts]);
  const visibleProducts = React.useMemo(() => {
    if (catalogCat === '__all__') return searchedProducts;
    return searchedProducts.filter(p => ((p.category || '').trim() || 'Catálogo') === catalogCat);
  }, [searchedProducts, catalogCat]);

  // Si la categoría elegida deja de existir tras buscar, se vuelve a "Todo".
  useEffect(() => {
    if (catalogCat !== '__all__' && !catalogCounts[catalogCat]) setCatalogCat('__all__');
  }, [catalogCounts, catalogCat]);

  // ── Vista de catálogo a página completa ("Ver todo") ─────────────────────
  const [showFullCatalog, setShowFullCatalog] = useState(false);
  const catalogItems = React.useMemo(
    () => products.map((p: any) => ({
      id: String(p.id),
      name: p.name,
      price: p.price,
      image: p.imageURL,
      category: p.category,
      description: p.shortDescription || p.description,
      disabled: p.stock === 0,
      badge: p.stock === 0 ? undefined : undefined,
      raw: p,
    })),
    [products],
  );

  return (
    <div className={`min-h-screen relative overflow-hidden pb-20 ${profileStyleLayer(profile).className}`}
      style={{
        ...profileStyleLayer(profile).style,
        backgroundColor: profile?.backgroundColor || '#090e14',
        color: profile?.textColor || '#f0f4f8',
        fontFamily: profile?.fontFamily || "'Space Grotesk', sans-serif",
      }}>
      {!isMobilePreview && <div className="cinema-grain" aria-hidden="true" />}

      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-[#00e5a0]/5 via-transparent to-transparent pointer-events-none" />
      <div className="absolute top-0 right-0 w-80 h-80 rounded-full bg-[#00e5a0]/5 blur-3xl pointer-events-none" />

      {/* Cart FAB (ULTRA) */}
      {isUltra && !isMobilePreview && (
        <button
          id="ecom-cart-fab"
          onClick={() => dispatchCart({ type: 'TOGGLE' })}
          style={{ backgroundColor: accent }}
          className="fixed top-5 right-5 z-[9980] w-12 h-12 rounded-full text-black flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform"
          aria-label="Abrir carrito"
        >
          <FaShoppingCart className="w-5 h-5" />
          {cart.items.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-[#ff6b35] text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-[#090e14]">
              {cart.items.reduce((a, i) => a + i.quantity, 0)}
            </span>
          )}
        </button>
      )}

      {isUltra && cart.isOpen && (
        <CartDrawer state={cart} dispatch={dispatchCart} profile={profile} onCheckout={handleCheckout} />
      )}

      {/* ── IDENTITY LAYER ─────────────────────────────── */}
      <div className="relative">
        {profile.coverImageURL ? (
          <div className="w-full h-52 sm:h-72 overflow-hidden relative">
            <img src={profile.coverImageURL} alt="Banner del catálogo"
              className="cinema-hero-cover w-full h-full object-cover"
              style={{ filter: 'brightness(0.65) saturate(1.1)' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-[#090e14] via-[#090e14]/20 to-black/30 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none" />
          </div>
        ) : (
          <div className="w-full h-36 bg-gradient-to-r from-[#00e5a0]/10 to-transparent border-b border-[#00e5a0]/10" />
        )}

        <div className="relative flex flex-col items-center px-4 -mt-14 sm:-mt-18 cinema-animate-in">
          <div className="relative mb-4">
            {(profile.profilePhotoURL || profile.logoURL) && (
              <div className="relative">
                <div className="cinema-glow-ring absolute inset-0 rounded-2xl blur-xl"
                  style={{ background: 'radial-gradient(circle, #00e5a055, transparent 70%)', transform: 'scale(1.4)' }} />
                {/* Solo la foto de perfil (con el logo como respaldo si no hay foto).
                    El logo de marca vive en la portada y en el pie de página. */}
                <img src={profile.profilePhotoURL || profile.logoURL} alt={profile.profilePhotoURL ? 'Foto de perfil' : 'Logo de marca'}
                  className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover relative z-10"
                  style={{ border: '2px solid rgba(0,229,160,0.3)', boxShadow: '0 0 0 4px #090e14, 0 20px 60px rgba(0,0,0,0.9)' }} />
              </div>
            )}
          </div>

          <div className="text-center max-w-md">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">{profile.displayName}</h1>
            {profile.company && (
              <p className="text-xs text-[#00e5a0] font-bold uppercase tracking-widest mt-1">{profile.company}</p>
            )}
            {profile.bio && (
              <p className="mt-3 text-xs text-white/60 leading-relaxed max-w-sm mx-auto">{profile.bio}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── ACTION BUTTONS ──────────────────────────────── */}
      <div className="w-full max-w-md mx-auto mt-5 px-4 flex flex-wrap justify-center gap-2">
        <button
          id="ecom-share-catalog"
          onClick={handleShareCatalog}
          style={{ backgroundColor: accent }}
          className="flex items-center gap-2 px-4 py-2.5 text-black font-black text-xs uppercase tracking-wider rounded-xl transition-all hover:brightness-110 active:scale-95 shadow-lg min-h-[44px]"
        >
          <FaShareAlt className="w-3.5 h-3.5" /> Compartir
        </button>
        {profile.phone && (
          <a href={`tel:${profile.phone}`}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 hover:border-[#00e5a0]/40 text-white hover:text-[#00e5a0] transition-all hover:scale-105 min-h-[44px]" title="Llamar">
            <FaPhoneAlt className="w-4 h-4" />
          </a>
        )}
        {profile.whatsapp && (
          <a href={`https://wa.me/${formatWANumber(profile.whatsapp)}`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 hover:border-[#25D366]/40 text-white hover:text-[#25D366] transition-all hover:scale-105 min-h-[44px]" title="WhatsApp">
            <FaWhatsapp className="w-4.5 h-4.5" />
          </a>
        )}
        {profile.contactEmail && (
          <a href={`mailto:${profile.contactEmail}`}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 hover:border-[#00e5a0]/40 text-white hover:text-[#00e5a0] transition-all hover:scale-105 min-h-[44px]" title="Email">
            <FaEnvelope className="w-4 h-4" />
          </a>
        )}
        {setShowQRModal && (
          <button onClick={() => setShowQRModal(true)}
            className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 hover:border-[#00e5a0]/40 text-white hover:text-[#00e5a0] transition-all hover:scale-105 min-h-[44px]" title="QR">
            <FaQrcode className="w-4 h-4" />
          </button>
        )}
        {!isMobilePreview && (
          <button
            onClick={() => setShowTracker(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 text-white/70 hover:text-[#00e5a0] font-black text-xs uppercase tracking-wider rounded-xl transition-all hover:border-[#00e5a0]/30 active:scale-95 min-h-[44px]"
            title="Rastrear pedido"
          >
            <FaClock className="w-3.5 h-3.5" /> Rastrear pedido
          </button>
        )}
      </div>

      {/* ── SOCIAL MEDIA ────────────────────────────────── */}
      {sectionOn('social') && profile.socialMedia && (
        profile.socialMedia.instagram || profile.socialMedia.facebook ||
        profile.socialMedia.tiktok || profile.socialMedia.twitter ||
        profile.socialMedia.youtube || profile.socialMedia.linkedin ||
        profile.socialMedia.website
      ) && (
        <div className="flex justify-center flex-wrap gap-2 mt-4 px-4">
          {profile.socialMedia.instagram && (
            <a href={`https://instagram.com/${profile.socialMedia.instagram.replace('@','')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#00e5a0]/30 text-white/60 hover:text-white transition" title="Instagram">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.facebook && (
            <a href={profile.socialMedia.facebook.startsWith('http') ? profile.socialMedia.facebook : `https://facebook.com/${profile.socialMedia.facebook}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#00e5a0]/30 text-white/60 hover:text-white transition" title="Facebook">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.tiktok && (
            <a href={`https://tiktok.com/@${profile.socialMedia.tiktok.replace('@','')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#00e5a0]/30 text-white/60 hover:text-white transition" title="TikTok">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.twitter && (
            <a href={`https://x.com/${profile.socialMedia.twitter.replace('@','')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#00e5a0]/30 text-white/60 hover:text-white transition" title="X / Twitter">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.75l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.youtube && (
            <a href={profile.socialMedia.youtube.startsWith('http') ? profile.socialMedia.youtube : `https://youtube.com/@${profile.socialMedia.youtube}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#00e5a0]/30 text-white/60 hover:text-white transition" title="YouTube">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.linkedin && (
            <a href={profile.socialMedia.linkedin.startsWith('http') ? profile.socialMedia.linkedin : `https://linkedin.com/in/${profile.socialMedia.linkedin}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#00e5a0]/30 text-white/60 hover:text-white transition" title="LinkedIn">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.website && (
            <a href={profile.socialMedia.website} target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#00e5a0]/30 text-white/60 hover:text-white transition" title="Sitio Web">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </a>
          )}
        </div>
      )}

      {/* ── MAIN CONTENT ──────────────────────────────── */}
      <div className="w-full max-w-2xl mx-auto px-4 mt-8 space-y-6 cinema-animate-in-delay-2">

        {/* Club Ecom — registro y consulta de membresía */}
        {isProOrUltra && !isMobilePreview && (
          <div className="relative rounded-2xl p-5 overflow-hidden border border-[#00e5a0]/20 bg-gradient-to-r from-[#00e5a0]/8 to-transparent">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#00e5a0]/10 rounded-bl-full blur-xl pointer-events-none" />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00e5a0]/15 flex items-center justify-center text-xl shrink-0">🛍️</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-white">Club {profile.displayName}</h3>
                <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
                  Únete gratis y accede a descuentos exclusivos en tus compras.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => setShowClubModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00e5a0] text-black font-black text-xs uppercase tracking-wider shadow-lg hover:scale-105 active:scale-95 transition-all"
                  >
                    <FaStar className="w-3 h-3" /> Unirme al Club
                  </button>
                  <button
                    onClick={() => setShowLookupModal(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    <FaSearch className="w-3 h-3" /> Consultar mi tarjeta
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Agendar una cita — aparece solo si el dueño ya cargó su equipo de vendedores */}
        {isProOrUltra && !isMobilePreview && apptStaff.length > 0 && (
          <div className="relative rounded-2xl p-5 overflow-hidden border border-[#00e5a0]/20 bg-gradient-to-r from-[#00e5a0]/8 to-transparent">
            <div className="absolute top-0 right-0 w-20 h-20 bg-[#00e5a0]/10 rounded-bl-full blur-xl pointer-events-none" />
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00e5a0]/15 flex items-center justify-center text-xl shrink-0">📅</div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-black text-white">Agenda tu cita</h3>
                <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
                  Elige lo que te interesa, con quién quieres ser atendido y a qué hora.
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={() => setShowAppointment(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#00e5a0] text-black font-black text-xs uppercase tracking-wider shadow-lg hover:scale-105 active:scale-95 transition-all"
                  >
                    <FaCalendarAlt className="w-3 h-3" /> Agendar una cita
                  </button>
                  <button
                    onClick={() => setShowApptLookup(true)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-white/70 hover:text-white text-xs font-bold uppercase tracking-wider transition-all"
                  >
                    <FaSearch className="w-3 h-3" /> Consultar mi cita
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Custom Links */}
        {sectionOn('links') && isProOrUltra && links.filter(l => l.isActive).length > 0 && (
          <div className="space-y-2">
            {links.filter(l => l.isActive).map(link => (
              <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => onLinkClick?.(link.id)}
                className="block w-full py-3.5 px-5 text-center font-bold text-sm bg-white/5 rounded-xl border border-white/10 hover:border-[#00e5a0]/40 text-white hover:text-[#00e5a0] transition-all hover:scale-[1.01] hover:bg-white/8 tracking-wider min-h-[48px]">
                {link.title}
              </a>
            ))}
          </div>
        )}

        {/* Catálogo de Productos — carrusel horizontal (no crece en vertical) */}
        {sectionOn('products') && isProOrUltra && products.length > 0 && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-6 bg-[#00e5a0] rounded-full" />
              <h2 className="text-sm font-black uppercase tracking-widest text-[#00e5a0] flex-1">Catálogo de Productos</h2>
              {products.length > 2 && !isMobilePreview && (
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Anterior" onClick={() => scrollProducts('prev')}
                    className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-[#00e5a0] hover:border-[#00e5a0]/40 flex items-center justify-center transition">‹</button>
                  <button type="button" aria-label="Siguiente" onClick={() => scrollProducts('next')}
                    className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-white/70 hover:text-[#00e5a0] hover:border-[#00e5a0]/40 flex items-center justify-center transition">›</button>
                </div>
              )}
            </div>

            {/* Buscador ágil + categorías (catálogos grandes) */}
            {products.length > 6 && (
              <div className="mb-4 space-y-3">
                <div className="relative">
                  <FaSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25 w-3.5 h-3.5" />
                  <input value={catalogQuery} onChange={e => setCatalogQuery(e.target.value)}
                    placeholder="Buscar por nombre, marca o categoría"
                    className="w-full bg-white/5 border border-white/10 text-white text-sm rounded-xl pl-10 pr-9 py-2.5 focus:outline-none focus:border-[#00e5a0]/40 placeholder-white/25" />
                  {catalogQuery && (
                    <button onClick={() => setCatalogQuery('')} aria-label="Limpiar búsqueda"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition p-1">
                      <FaTimes size={12} />
                    </button>
                  )}
                </div>
                {catalogCategories.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                    <button onClick={() => setCatalogCat('__all__')}
                      className={`px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider shrink-0 border transition-all ${
                        catalogCat === '__all__'
                          ? 'bg-[#00e5a0] border-transparent text-black'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                      }`}>
                      Todo <span className="opacity-60">({searchedProducts.length})</span>
                    </button>
                    {catalogCategories.map(cat => (
                      <button key={cat} onClick={() => setCatalogCat(cat)}
                        className={`px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider shrink-0 border transition-all ${
                          catalogCat === cat
                            ? 'bg-[#00e5a0] border-transparent text-black'
                            : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                        }`}>
                        {cat} <span className="opacity-60">({catalogCounts[cat] || 0})</span>
                      </button>
                    ))}
                  </div>
                )}
                {visibleProducts.length === 0 && (
                  <p className="text-xs text-white/35 py-6 text-center">
                    Sin resultados{catalogQuery ? ` para “${catalogQuery}”` : ''}.
                  </p>
                )}
              </div>
            )}

            <div
              ref={productScrollRef}
              className="flex gap-3 overflow-x-auto snap-x snap-mandatory no-scrollbar pb-2 -mx-1 px-1"
            >
              {visibleProducts.map(product => {
                const soldOut = product.stock === 0;
                const inCart = cart.items.find(i => i.product.id === product.id);
                return (
                  <div
                    key={product.id}
                    onClick={() => setSelectedProduct(product)}
                    className={`relative shrink-0 snap-start w-[150px] sm:w-[180px] bg-white/5 rounded-2xl border overflow-hidden shadow-lg transition-all duration-300 cursor-pointer group ${
                      soldOut ? 'border-white/5 opacity-60' : 'border-white/10 hover:border-[#00e5a0]/40 hover:scale-[1.02] hover:shadow-[#00e5a0]/10'
                    }`}
                  >
                    <div className="relative w-full aspect-square overflow-hidden bg-black/30">
                      {product.imageURL ? (
                        <img src={product.imageURL} alt={product.name}
                          className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl text-white/10">🛍️</div>
                      )}
                      {soldOut && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-[10px] font-black text-red-400 uppercase tracking-widest border border-red-400/40 rounded-lg px-2 py-0.5">Agotado</span>
                        </div>
                      )}
                      {inCart && !soldOut && (
                        <div className="absolute top-1.5 right-1.5 bg-[#00e5a0] text-black text-[9px] font-black px-1.5 py-0.5 rounded-full">
                          {inCart.quantity}
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <h3 className="cnx-product-text font-black text-xs text-white line-clamp-2 uppercase tracking-wide leading-tight">
                        {product.name}
                      </h3>
                      <div className="flex items-center justify-between mt-2 gap-1">
                        <div>
                          {product.price && (
                            <span className="text-sm font-black text-[#00e5a0]">{product.price}</span>
                          )}
                          <div className="mt-0.5"><StockBadge stock={product.stock} /></div>
                        </div>
                        <span className="text-[10px] text-white/40 border border-white/10 rounded-lg px-1.5 py-0.5 font-bold uppercase tracking-widest group-hover:border-[#00e5a0]/30 group-hover:text-[#00e5a0]/60 transition shrink-0">
                          Ver
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => setShowFullCatalog(true)}
              style={{ backgroundColor: accent }}
              className="mt-4 w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-black shadow-lg transition-all hover:brightness-110 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2">
              <FaShoppingBag size={12} /> Ver todo el catálogo ({products.length})
            </button>
          </div>
        )}

        {/* Gallery — soporta modo grid (imágenes planas) y modo álbumes */}
        {(() => {
          const albumsMode = (profile as any)?.galleryMode === 'albums';
          const albums: any[] = Array.isArray((profile as any)?.albums) ? (profile as any).albums : [];
          const flatImages: string[] = Array.isArray(profile.galleryImageURLs) ? profile.galleryImageURLs : [];
          const hasGallery = albumsMode ? albums.length > 0 : flatImages.length > 0;
          if (!(sectionOn('gallery') && isProOrUltra && hasGallery)) return null;
          return (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 bg-[#00e5a0] rounded-full" />
                <h2 className="text-sm font-black uppercase tracking-widest text-[#00e5a0]">{((profile as any)?.galleryTitle || '').trim() || 'Galería'}</h2>
              </div>
              {albumsMode ? (
                <div className="grid grid-cols-2 gap-3">
                  {albums.map((a: any, i: number) => {
                    const cover = a.coverUrl || a.cover || (Array.isArray(a.images) && a.images[0]);
                    const count = Array.isArray(a.images) ? a.images.length : 0;
                    return (
                      <button
                        key={a.id || i}
                        type="button"
                        onClick={() => { if (!isMobilePreview && count > 0) setSelectedAlbum(a); }}
                        className="text-left rounded-xl overflow-hidden bg-black/30 border border-white/5 hover:border-[#00e5a0]/30 group transition"
                      >
                        <div className="relative w-full h-32 overflow-hidden bg-black/40">
                          {cover ? (
                            <img src={cover} alt={a.title || `Álbum ${i + 1}`}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl text-white/10">🖼️</div>
                          )}
                          <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">{count} 📷</span>
                        </div>
                        {a.title && <p className="text-[11px] text-white/80 font-bold px-2 py-1.5 truncate">{a.title}</p>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {flatImages.map((url, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { if (!isMobilePreview) setVisor({ images: flatImages, index: i }); }}
                      aria-label={`Ampliar imagen ${i + 1}`}
                      className="aspect-square rounded-xl overflow-hidden bg-black/30 border border-white/5 hover:border-[#00e5a0]/30 group transition block w-full cursor-pointer"
                    >
                      <img src={url} alt={`Galería ${i + 1}`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Testimonials */}
        {sectionOn('testimonials') && isProOrUltra && ((Array.isArray(profile.testimonials) && profile.testimonials.length > 0) || (!!onLeaveTestimonial && !isMobilePreview)) && (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1 h-6 bg-[#00e5a0] rounded-full" />
              <h2 className="text-sm font-black uppercase tracking-widest text-[#00e5a0]">Reseñas</h2>
            </div>
            <div className="space-y-3">
              {(Array.isArray(profile.testimonials) ? profile.testimonials : []).map(t => (
                <div key={t.id} className="bg-white/5 border border-white/5 rounded-xl p-4">
                  <p className="cnx-testimonial-text text-xs text-white/75 italic leading-relaxed">"{t.quote}"</p>
                  <div className="flex items-center gap-2 mt-3">
                    {t.authorImageURL && (
                      <img src={t.authorImageURL} alt={t.author} className="w-6 h-6 rounded-full object-cover border border-[#00e5a0]/30" />
                    )}
                    <div>
                      <p className="text-[11px] font-black text-[#00e5a0] uppercase tracking-wider">{t.author}</p>
                      {t.authorTitle && <p className="text-[10px] text-white/40">{t.authorTitle}</p>}
                    </div>
                  </div>
                </div>
              ))}
              {(!Array.isArray(profile.testimonials) || profile.testimonials.length === 0) && (
                <p className="text-xs text-white/40 italic text-center py-3">Aún no hay reseñas. ¡Sé el primero en dejar una!</p>
              )}
            </div>
            {onLeaveTestimonial && !isMobilePreview && (
              <div className="mt-4 text-center">
                <button
                  onClick={onLeaveTestimonial}
                  className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#00e5a0] border border-[#00e5a0]/40 rounded-full py-2.5 px-5 hover:bg-[#00e5a0]/10 transition min-h-[44px]"
                >
                  ✍ Dejar Reseña
                </button>
              </div>
            )}
          </div>
        )}

        {/* Location */}
        {profile.location && (
          <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.location)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 bg-white/5 rounded-xl border border-white/5 hover:border-[#00e5a0]/30 transition text-xs text-white/60 hover:text-white">
            <FaMapMarkerAlt className="text-[#00e5a0] shrink-0" />
            <span>{profile.location}</span>
          </a>
        )}
      </div>

      {/* ── Horarios ── */}
      {profile.showSchedule && Array.isArray(profile.businessHours) && profile.businessHours.length > 0 && (
        <div className="w-full max-w-2xl mx-auto px-4 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-1 h-6 rounded-full" style={{ backgroundColor: accent }} />
            <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: accent }}>Horarios</h2>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
            {profile.businessHours.map((day: any, i: number) => (
              <div key={i} className={`flex items-center justify-between px-4 py-3 ${i < profile.businessHours.length - 1 ? 'border-b border-white/5' : ''}`}>
                <span className="text-sm font-bold text-white/80">{day.day}</span>
                {day.isOpen ? (
                  <span className="text-sm font-bold" style={{ color: accent }}>{day.openTime} – {day.closeTime}</span>
                ) : (
                  <span className="text-xs text-white/30 font-bold uppercase tracking-wider">Cerrado</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {showFullCatalog && (
        <FullCatalogView
          items={catalogItems}
          onBack={() => setShowFullCatalog(false)}
          onSelect={(raw) => { setShowFullCatalog(false); setSelectedProduct(raw); }}
          accent={accent}
          bg={profile?.backgroundColor || '#090e14'}
          text={profile?.textColor || '#f0f4f8'}
          fontFamily={profile?.fontFamily || "'Space Grotesk', sans-serif"}
          title="Catálogo de Productos"
          searchPlaceholder="Buscar por nombre, marca o categoría"
          emptyLabel="El catálogo estará disponible pronto."
          ctaLabel="Ver →"
          isMobilePreview={isMobilePreview}
        />
      )}

      <ProfileExtraSections profile={profile} accent={accent} skip={['gallery']} />

      {/* Footer */}
      <div className="w-full max-w-2xl mx-auto px-4 mt-12 text-center">
        {profile.logoURL && (
          <img src={profile.logoURL} alt="Logo" className="h-8 object-contain mx-auto opacity-50 mb-3" />
        )}
        <p className="text-[10px] text-white/20 tracking-widest uppercase">Powered by Connexo</p>
      </div>

      {/* ── Modals ──────────────────────────────────────── */}

      {selectedProduct && (
        <ProductModal
          product={selectedProduct}
          profile={profile}
          isUltra={isUltra}
          onClose={() => setSelectedProduct(null)}
          onAddToCart={(p, extras, extrasPrice, tierPrice) => { dispatchCart({ type: 'ADD', product: p, selectedExtras: extras, extrasUnitPrice: extrasPrice, tierUnitPrice: tierPrice }); setSelectedProduct(null); }}
          onCheckout={handleCheckout}
        />
      )}

      {selectedAlbum && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setSelectedAlbum(null)}>
          <div className="bg-[#0d0d14] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between gap-3 px-5 py-4 bg-[#0d0d14]/95 backdrop-blur border-b border-white/10">
              <h3 className="text-sm font-black uppercase tracking-widest text-[#00e5a0] truncate">{selectedAlbum.title || 'Álbum'}</h3>
              <button type="button" onClick={() => setSelectedAlbum(null)}
                className="shrink-0 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/70 hover:text-white flex items-center justify-center transition">✕</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-4">
              {(Array.isArray(selectedAlbum.images) ? selectedAlbum.images : []).map((url: string, i: number) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setVisor({
                    images: Array.isArray(selectedAlbum.images) ? selectedAlbum.images : [],
                    index: i,
                  })}
                  aria-label={`Ampliar imagen ${i + 1}`}
                  className="aspect-square rounded-xl overflow-hidden bg-black/40 border border-white/5 hover:border-[#00e5a0]/30 block w-full cursor-pointer transition"
                >
                  <img src={url} alt={`${selectedAlbum.title || 'Álbum'} ${i + 1}`} className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Visor de la galería. Va por portal sobre <body>, así que se dibuja
          por encima del modal del álbum sin quedar atrapado dentro de él. */}
      {visor && (
        <ImageLightbox
          images={visor.images}
          startIndex={visor.index}
          accent="#00e5a0"
          onClose={() => setVisor(null)}
        />
      )}

      {checkoutItems && (
        <CheckoutModal
          items={checkoutItems}
          profile={profile}
          sellerId={foundUserId}
          onClose={() => setCheckoutItems(null)}
          onOrderPlaced={() => dispatchCart({ type: 'CLEAR' })}
          prefillMemberCode={checkoutMemberCode}
          onTrackOrder={(code) => {
            setCheckoutItems(null);
            setTrackCode(code);
            setShowTracker(true);
          }}
        />
      )}

      {showClubModal && (
        <EcomClubModal
          profile={profile}
          sellerId={foundUserId}
          onClose={() => setShowClubModal(false)}
        />
      )}

      {showLookupModal && (
        <EcomMemberLookup
          profile={profile}
          sellerId={foundUserId}
          onClose={() => setShowLookupModal(false)}
          onApplyCode={code => {
            setShowLookupModal(false);
            setCheckoutMemberCode(code);
          }}
        />
      )}

      {showAppointment && (
        <EcomAppointmentModal
          profile={profile}
          sellerId={foundUserId}
          staff={apptStaff}
          accent={accent}
          isMobilePreview={isMobilePreview}
          onClose={() => setShowAppointment(false)}
        />
      )}

      {showApptLookup && (
        <EcomAppointmentLookup
          sellerId={foundUserId}
          accent={accent}
          onClose={() => setShowApptLookup(false)}
        />
      )}

      {showTracker && (
        <EcomOrderTracker
          sellerId={foundUserId}
          initialCode={trackCode}
          isMobilePreview={isMobilePreview}
          onClose={() => { setShowTracker(false); setTrackCode(null); }}
        />
      )}
    </div>
  );
};

export default ProfileEcomTemplate;
