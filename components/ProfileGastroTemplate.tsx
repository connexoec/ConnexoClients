import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MemberPlanBadge } from './MemberPlanCard';
import { supabase } from '../src/lib/supabase';
import { QRCodeCanvas } from 'qrcode.react';
import { ProfileExtraSections } from './ProfileExtraSections';
import FullCatalogView from './FullCatalogView';
import {
  FaUtensils, FaClock, FaCheckCircle,
  FaQrcode, FaShoppingBag,
  FaChevronRight, FaTimes, FaInbox,
  FaPhoneAlt, FaWhatsapp, FaEnvelope, FaShareAlt,
  FaMapMarkerAlt, FaStar, FaCalendarAlt, FaLink,
  FaGift, FaConciergeBell, FaMotorcycle, FaAllergies,
  FaMobileAlt, FaUniversity, FaCopy, FaSearch
} from 'react-icons/fa';
import type { PaymentGatewaysConfig } from '../types';
import {
  useDebouncedValue, filterCatalog, countByCategory, applyCatalogLimit,
} from '../hooks/useCatalogSearch';

interface ProfileGastroTemplateProps {
  profile: any;
  links?: any[];
  onLinkClick?: (linkId: string) => void;
  onSelectProduct?: (product: any) => void;
  onOpenLeadForm?: () => void;
  currentUser?: any;
  visitorProfile?: any;
  userId?: string | null;
  downloadVCard?: () => void;
  handleShare?: () => void;
  setShowQRModal?: (show: boolean) => void;
  isVCardLoading?: boolean;
  handleStartChat?: () => void;
  isStartingChat?: boolean;
  isMobilePreview?: boolean;
}

// WhatsApp Ecuador: normaliza números locales (0XXXXXXXXX → 593XXXXXXXXX).
// Connexo Ecuador → si empieza con 0 y tiene 10 dígitos, reemplaza el 0 por 593.
const ecWaNumber = (raw?: string): string => {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('593')) return d;
  if (d.startsWith('0')) d = '593' + d.slice(1);
  else if (d.length === 9) d = '593' + d; // sin 0 inicial
  return d;
};
const ecWaLink = (raw: string | undefined, message: string) =>
  `https://wa.me/${ecWaNumber(raw)}?text=${encodeURIComponent(message)}`;

export const ProfileGastroTemplate: React.FC<ProfileGastroTemplateProps> = ({
  profile,
  links = [],
  onLinkClick,
  currentUser,
  visitorProfile,
  userId,
  downloadVCard,
  handleShare,
  setShowQRModal,
  isVCardLoading = false,
  isMobilePreview = false
}) => {
  const [selectedCat, setSelectedCat] = useState<string>('');
  const [activeOrderModal, setActiveOrderModal] = useState<any | null>(null);
  const [orderType, setOrderType] = useState<'mesa' | 'delivery'>('mesa');
  const [mesaNumber, setMesaNumber] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [ordering, setOrdering] = useState<boolean>(false);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);
  const [showFullMenu, setShowFullMenu] = useState<boolean>(false);
  const [fullMenuCat, setFullMenuCat] = useState<string>('');
  const [catalogQuery, setCatalogQuery] = useState<string>('');
  // Datos del cliente (delivery)
  const [custName, setCustName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [custAddress, setCustAddress] = useState<string>('');
  // Club Secreto (captura de leads)
  const [showClub, setShowClub] = useState<boolean>(false);
  // Rastreo de pedido en vivo (por código)
  const [trackCode, setTrackCode] = useState<string | null>(null);
  const [showTracker, setShowTracker] = useState<boolean>(false);
  // Factura (datos de facturación por pedido)
  const [invoiceCode, setInvoiceCode] = useState<string | null>(null);
  // Código de miembro VIP aplicado en el pedido (descuentos)
  const [memberCode, setMemberCode] = useState<string>('');
  const [memberInfo, setMemberInfo] = useState<any | null>(null);
  const [checkingMember, setCheckingMember] = useState<boolean>(false);
  const [memberChecked, setMemberChecked] = useState<boolean>(false);
  // Reservas (gastro ULTRA)
  const [showReserve, setShowReserve] = useState<boolean>(false);
  // Disponibilidad de platos según inventario (IDs agotados)
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  // Deep-link: si la URL trae ?pedido=CODE (desde el QR), abre el rastreador.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = new URLSearchParams(window.location.search).get('pedido');
    if (code) { setTrackCode(code); setShowTracker(true); }
  }, []);

  // Group products by category dynamically
  const categorizedProducts = useMemo(() => {
    const map: Record<string, any[]> = {};
    const defaultCat = 'Menú';
    // Los platos desactivados por el admin (available === false) se ocultan del menú público.
    const products = (profile?.products || []).filter((p: any) => p?.available !== false);

    products.forEach((p: any) => {
      let cat = defaultCat;
      let name = p.name || '';

      // Preferimos el campo explícito `category`; si no, parseamos "Cat | Nombre".
      if (p.category && String(p.category).trim()) {
        cat = String(p.category).trim();
      } else if (name.includes('|')) {
        const parts = name.split('|');
        cat = parts[0].trim();
        name = parts.slice(1).join('|').trim();
      } else if (name.includes('-') && !name.startsWith('-')) {
        const parts = name.split('-');
        cat = parts[0].trim();
        name = parts.slice(1).join('-').trim();
      }

      if (!map[cat]) map[cat] = [];
      map[cat].push({ ...p, cleanName: name, category: cat });
    });

    return map;
  }, [profile?.products]);

  const plan = (profile?.plan ?? 'free').toLowerCase();

  const categoryNames = useMemo(() => Object.keys(categorizedProducts), [categorizedProducts]);

  // ULTRA: menú ilimitado. Planes inferiores: tope histórico de 25 platos.
  const allProducts = useMemo(() => {
    const flat: any[] = [];
    categoryNames.forEach(cat => categorizedProducts[cat].forEach(p => flat.push(p)));
    return applyCatalogLimit(flat, plan);
  }, [categorizedProducts, categoryNames, plan]);

  // Buscador del menú completo (nombre, categoría, marca, descripción).
  const debouncedQuery = useDebouncedValue(catalogQuery, 220);
  const isSearching = debouncedQuery.trim().length > 0;
  const searchResults = useMemo(
    () => filterCatalog(allProducts, debouncedQuery),
    [allProducts, debouncedQuery],
  );
  const resultCounts = useMemo(() => countByCategory(searchResults), [searchResults]);
  const modalCategories = useMemo(
    () => (isSearching ? categoryNames.filter(c => (resultCounts[c] || 0) > 0) : categoryNames),
    [categoryNames, resultCounts, isSearching],
  );
  const modalProducts = useMemo(
    () => (isSearching ? searchResults : (categorizedProducts[fullMenuCat] || [])),
    [isSearching, searchResults, categorizedProducts, fullMenuCat],
  );

  const sellerId = profile?.id ?? userId ?? null;
  const tableCount = Math.max(0, parseInt(String(profile?.tableCount ?? 0), 10) || 0);

  // ── Pasarelas de pago activas (leídas de profile.payment_gateways) ──────────
  const rawGw = profile?.payment_gateways;
  const gwCfg: PaymentGatewaysConfig = (rawGw && !Array.isArray(rawGw)) ? rawGw : {};
  const hasGateways = !!(gwCfg.directLink?.enabled || gwCfg.payphone?.enabled || gwCfg.bankTransfer?.enabled || gwCfg.whatsapp?.enabled);
  const [payphoneBusy, setPayphoneBusy] = useState(false);
  const [payphoneMsg, setPayphoneMsg] = useState<string | null>(null);
  const [copiedAcc, setCopiedAcc] = useState(false);

  // PayPhone: invoca la Edge Function del comercio con el monto del pedido
  const handlePayphone = async (amount: number, reference: string, customer: string) => {
    if (payphoneBusy) return;
    setPayphoneBusy(true);
    setPayphoneMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('payphone_charge', {
        body: {
          token: gwCfg.payphone?.token ?? null,
          storeId: gwCfg.payphone?.storeId ?? null,
          amount, reference, customer,
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

  const copyAccount = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopiedAcc(true);
      setTimeout(() => setCopiedAcc(false), 1500);
    }).catch(() => {});
  };

  React.useEffect(() => {
    if (categoryNames.length > 0 && !selectedCat) {
      setSelectedCat(categoryNames[0]);
    }
    if (categoryNames.length > 0 && !fullMenuCat) {
      setFullMenuCat(categoryNames[0]);
    }
  }, [categoryNames, selectedCat, fullMenuCat]);

  const isProOrUltra = plan === 'pro' || plan === 'ultra';
  const isUltra = plan === 'ultra';
  // Reservas nativas: solo gastro ULTRA con reservas activadas por el dueño.
  const reservationsOn = isUltra && !!profile?.reservationsEnabled;
  // Organizar secciones: visible salvo que el dueño la oculte explícitamente.
  const sectionOn = (k: string) => (profile as any)?.sectionVisibility?.[k] !== false;

  // Disponibilidad del menú según inventario: marca platos agotados al público.
  useEffect(() => {
    if (isMobilePreview || !sellerId) return;
    let active = true;
    const fetchAvailability = async () => {
      try {
        const { data, error } = await supabase.rpc('get_gastro_menu_availability', { p_restaurant_id: sellerId });
        if (error) throw error;
        if (active && data?.unavailable) setUnavailableIds(new Set(data.unavailable as string[]));
      } catch (e) { /* fail-open: nada agotado */ }
    };
    fetchAvailability();
    const id = setInterval(fetchAvailability, 30000);
    return () => { active = false; clearInterval(id); };
  }, [sellerId, isMobilePreview]);

  const isAgotado = (product: any) => product?.id != null && unavailableIds.has(String(product.id));
  // Color de acento del cliente (Apariencia). Si no eligió, usa el de la plantilla.
  const accent = (profile?.buttonColor && String(profile.buttonColor).trim()) || '#ff6b35';
  // Nombre del club de fidelidad (el dueño puede renombrarlo en "Menú y Mesas").
  const clubName = (profile?.clubName && String(profile.clubName).trim()) || 'Club Secreto';
  const clubTagline = (profile?.clubTagline && String(profile.clubTagline).trim()) || 'Recibe un beneficio de bienvenida hoy y ofertas exclusivas.';
  // Platos disponibles (no agotados) para el pre-pedido de reservas.
  const availableDishes = useMemo(
    () => allProducts.filter((p: any) => !isAgotado(p)),
    [allProducts, unavailableIds]
  );

  // Ítems para la vista de catálogo a página completa ("Ver Menú Completo").
  const catalogItems = useMemo(
    () => allProducts.map((p: any) => ({
      id: String(p.id),
      name: p.cleanName || p.name,
      price: p.price,
      image: p.imageURL,
      category: p.category,
      description: p.shortDescription,
      disabled: isAgotado(p),
      raw: p,
    })),
    [allProducts, unavailableIds]
  );

  const openDish = (product: any) => {
    if (isAgotado(product)) return; // plato sin ingredientes: no se puede pedir
    setSuccessOrder(null);
    setActiveOrderModal(product);
    setQuantity(1);
    setMesaNumber('');
    setOrderType('mesa');
    setCustName('');
    setCustPhone('');
    setCustAddress('');
    setMemberCode('');
    setMemberInfo(null);
    setMemberChecked(false);
  };

  const applyMemberCode = async () => {
    if (!memberCode.trim() || checkingMember) return;
    setCheckingMember(true);
    setMemberChecked(false);
    if (isMobilePreview) {
      setMemberInfo({ found: true, member_code: memberCode.trim().toUpperCase(), is_vip: true, discount_percent: 10 });
      setCheckingMember(false); setMemberChecked(true); return;
    }
    try {
      const { data, error } = await supabase.rpc('get_gastro_member', {
        p_restaurant_id: sellerId, p_identifier: memberCode.trim(),
      });
      if (error) throw error;
      setMemberInfo(data && data.found ? data : null);
    } catch (e) {
      console.error('get_gastro_member error:', e);
      setMemberInfo(null);
    } finally {
      setCheckingMember(false);
      setMemberChecked(true);
    }
  };

  // Total con descuento de miembro aplicado
  const dishBase = activeOrderModal ? (parseFloat((activeOrderModal.price || '0').replace(/[^0-9.]/g, '')) || 0) * quantity : 0;
  const memberDiscount = memberInfo?.found ? (memberInfo.discount_percent || 0) : 0;
  const dishTotal = +(dishBase * (1 - memberDiscount / 100)).toFixed(2);

  const handlePlaceOrder = async () => {
    if (!activeOrderModal) return;
    if (isMobilePreview) {
      alert("Previsualización: El pedido se procesará en producción.");
      setActiveOrderModal(null);
      return;
    }
    if (!sellerId) {
      alert("No se pudo identificar el restaurante. Recarga e intenta de nuevo.");
      return;
    }

    if (orderType === 'mesa' && !mesaNumber.trim()) {
      alert("Por favor, indica el número de mesa.");
      return;
    }
    if (orderType === 'delivery' && (!custName.trim() || !custPhone.trim() || !custAddress.trim())) {
      alert("Para delivery necesitamos tu nombre, teléfono y dirección.");
      return;
    }

    setOrdering(true);
    const total = dishTotal;

    const items = [{
      id: activeOrderModal.id,
      name: activeOrderModal.cleanName || activeOrderModal.name,
      price: activeOrderModal.price,
      qty: quantity,
      imageURL: activeOrderModal.imageURL
    }];

    const vipNote = memberInfo?.found && memberDiscount > 0
      ? `Miembro VIP ${memberInfo.member_code} (-${memberDiscount}%)`
      : null;

    try {
      const { data, error } = await supabase.rpc('place_gastro_order', {
        p_restaurant_id: sellerId,
        p_items: items,
        p_total_price: total,
        p_order_type: orderType,
        p_mesa_number: orderType === 'mesa' ? mesaNumber.trim() : null,
        p_customer_name: orderType === 'delivery' ? custName.trim() : null,
        p_customer_phone: orderType === 'delivery' ? custPhone.trim() : null,
        p_delivery_address: orderType === 'delivery' ? custAddress.trim() : null,
        p_notes: vipNote,
        p_member_code: memberInfo?.found ? memberInfo.member_code : null,
      });
      if (error) throw error;

      setSuccessOrder({
        id: data?.id ?? null,
        verification_code: data?.verification_code ?? '-----',
        order_type: orderType,
        mesa_number: mesaNumber.trim(),
        customer_name: custName.trim(),
        total_price: total,
      });
      setActiveOrderModal(null);
    } catch (err: any) {
      console.error("Error creating order:", err.message || err);
      alert(`No se pudo enviar el pedido: ${err?.message || 'intenta nuevamente'}.`);
    } finally {
      setOrdering(false);
    }
  };

  const hasSocialMedia = profile?.socialMedia && (
    profile.socialMedia.instagram || profile.socialMedia.facebook ||
    profile.socialMedia.tiktok || profile.socialMedia.twitter ||
    profile.socialMedia.youtube || profile.socialMedia.linkedin ||
    profile.socialMedia.website
  );

  const activeLinks = (links || []).filter((l: any) => l.isActive);

  // Business hours helper
  const businessHours = Array.isArray(profile?.businessHours) ? profile.businessHours :
    profile?.openingHours ? (() => {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const labels: Record<string,string> = { monday:'Lunes', tuesday:'Martes', wednesday:'Miércoles', thursday:'Jueves', friday:'Viernes', saturday:'Sábado', sunday:'Domingo' };
      return days.map(d => ({
        day: labels[d],
        isOpen: profile.openingHours[d]?.isActive,
        openTime: profile.openingHours[d]?.start,
        closeTime: profile.openingHours[d]?.end
      })).filter((d: any) => d.isOpen);
    })() : [];

  return (
    <div className={`min-h-screen relative overflow-x-clip ${profileStyleLayer(profile).className}`}
         style={{
           ...profileStyleLayer(profile).style,
           // El fondo y el color de texto salían de clases fijas; ahora se
           // pueden elegir desde Apariencia, con los de la plantilla de respaldo.
           backgroundColor: profile?.backgroundColor || '#060200',
           color: profile?.textColor || '#ffffff',
           fontFamily: profile?.fontFamily || "'Space Grotesk', -apple-system, sans-serif",
         }}>

      {/* Film grain overlay */}
      <div className="cinema-grain" aria-hidden="true" />

      {/* Cover Portada */}
      {profile?.coverImageURL ? (
        <div className="w-full h-52 sm:h-72 overflow-hidden relative">
          <img
            src={profile.coverImageURL}
            alt="Portada"
            className="cinema-hero-cover w-full h-full object-cover"
            style={{ filter: 'brightness(0.65) saturate(1.1)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#060200] via-[#060200]/20 to-black/30 pointer-events-none" />
          <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none" />
        </div>
      ) : (
        <div className="w-full h-36 bg-gradient-to-br from-[#1a0800] to-[#060200] border-b border-[#ff6b35]/10" />
      )}

      {/* ── HEADER / IDENTITY ─────────────────────────────────── */}
      <div className="relative flex flex-col items-center px-4 -mt-16 pb-4 cinema-animate-in">
        {/* Profile Photo — con el logo como respaldo.
            El logo se sube y se guarda, pero esta plantilla no lo dibujaba en
            ningún sitio: los locales que sólo cargaban logo se quedaban sin
            imagen. Cuando hay foto, la foto sigue mandando. */}
        {(profile?.profilePhotoURL || profile?.logoURL) && (
          <div className="relative">
            <div
              className="cinema-glow-ring absolute inset-0 rounded-3xl blur-xl"
              style={{ background: 'radial-gradient(circle, #ff6b3555, transparent 70%)', transform: 'scale(1.4)' }}
            />
            <img
              src={profile.profilePhotoURL || profile.logoURL}
              alt={profile.displayName}
              className="w-28 h-28 rounded-3xl object-cover relative z-10"
              style={{
                border: '2px solid rgba(255,107,53,0.25)',
                boxShadow: '0 0 0 4px #060200, 0 20px 60px rgba(0,0,0,0.9)'
              }}
            />
          </div>
        )}

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-center">{profile?.displayName}</h1>
        {profile?.company && <p className="text-[#ffefe5]/60 text-sm mt-1 tracking-wide">{profile.company}</p>}
        {profile?.jobTitle && <p className="text-[#ff6b35]/80 text-xs mt-0.5 uppercase tracking-widest font-bold">{profile.jobTitle}</p>}
        {profile?.bio && <p className="mt-3 text-center text-xs opacity-80 px-6 leading-relaxed max-w-md text-gray-300 italic">{profile.bio}</p>}

        {/* ── Contact Icon Buttons ─── */}
        <div className="flex flex-wrap justify-center gap-2.5 mt-5">
          {profile?.phone && (
            <a href={`tel:${profile.phone}`}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-[#ff6b35]/15 hover:border-[#ff6b35]/40 text-[#ffefe5]/70 hover:text-[#ffefe5] transition-all hover:scale-105"
              title="Llamar">
              <FaPhoneAlt size={14} />
            </a>
          )}
          {profile?.whatsapp && (
            <a href={`https://wa.me/${profile.whatsapp.replace(/\D/g,'')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-[#ff6b35]/15 hover:border-[#25D366]/40 text-[#ffefe5]/70 hover:text-[#25D366] transition-all hover:scale-105"
              title="WhatsApp">
              <FaWhatsapp size={16} />
            </a>
          )}
          {profile?.contactEmail && (
            <a href={`mailto:${profile.contactEmail}`}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-[#ff6b35]/15 hover:border-[#ff6b35]/40 text-[#ffefe5]/70 hover:text-[#ffefe5] transition-all hover:scale-105"
              title="Email">
              <FaEnvelope size={14} />
            </a>
          )}
          {setShowQRModal && (
            <button onClick={() => setShowQRModal(true)}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-[#ff6b35]/15 hover:border-[#ff6b35]/40 text-[#ffefe5]/70 hover:text-[#ffefe5] transition-all hover:scale-105"
              title="Ver QR">
              <FaQrcode size={14} />
            </button>
          )}
          {downloadVCard && (
            <button onClick={downloadVCard} disabled={isVCardLoading}
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-[#ff6b35]/15 hover:border-[#ff6b35]/40 text-[#ffefe5]/70 hover:text-[#ffefe5] transition-all hover:scale-105 disabled:opacity-50"
              title="Guardar Contacto">
              📥
            </button>
          )}
          {handleShare && (
            <button onClick={handleShare}
              className="flex items-center gap-2 px-4 h-11 bg-[#ff6b35] hover:bg-[#e85a25] text-white rounded-xl transition-all font-bold text-xs uppercase tracking-wider shadow-lg shadow-[#ff6b35]/15 hover:scale-105">
              <FaShareAlt size={12} />
              <span>Compartir</span>
            </button>
          )}
        </div>
      </div>

      {/* ── SOCIAL MEDIA ────────────────────────────────────────── */}
      {sectionOn('social') && hasSocialMedia && (
        <div className="flex justify-center flex-wrap gap-2 mt-4 px-4">
          {profile.socialMedia.instagram && (
            <a href={`https://instagram.com/${profile.socialMedia.instagram.replace('@','')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ff6b35]/20 text-[#ffefe5]/60 hover:text-[#ffefe5] transition"
              title="Instagram">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.facebook && (
            <a href={profile.socialMedia.facebook.startsWith('http') ? profile.socialMedia.facebook : `https://facebook.com/${profile.socialMedia.facebook}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ff6b35]/20 text-[#ffefe5]/60 hover:text-[#ffefe5] transition"
              title="Facebook">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.tiktok && (
            <a href={`https://tiktok.com/@${profile.socialMedia.tiktok.replace('@','')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ff6b35]/20 text-[#ffefe5]/60 hover:text-[#ffefe5] transition"
              title="TikTok">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.twitter && (
            <a href={`https://x.com/${profile.socialMedia.twitter.replace('@','')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ff6b35]/20 text-[#ffefe5]/60 hover:text-[#ffefe5] transition"
              title="X / Twitter">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.75l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.youtube && (
            <a href={profile.socialMedia.youtube.startsWith('http') ? profile.socialMedia.youtube : `https://youtube.com/@${profile.socialMedia.youtube}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ff6b35]/20 text-[#ffefe5]/60 hover:text-[#ffefe5] transition"
              title="YouTube">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.linkedin && (
            <a href={profile.socialMedia.linkedin.startsWith('http') ? profile.socialMedia.linkedin : `https://linkedin.com/in/${profile.socialMedia.linkedin}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ff6b35]/20 text-[#ffefe5]/60 hover:text-[#ffefe5] transition"
              title="LinkedIn">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.website && (
            <a href={profile.socialMedia.website}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ff6b35]/20 text-[#ffefe5]/60 hover:text-[#ffefe5] transition"
              title="Sitio Web">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </a>
          )}
        </div>
      )}

      {/* ── ADDRESS (debajo de las redes sociales) ──────────────── */}
      {(profile?.location || (Array.isArray(profile?.locations) && profile.locations.length > 0)) && (
        <div className="flex flex-col items-center gap-1.5 px-4 mt-4 mb-1">
          {(Array.isArray(profile?.locations) && profile.locations.length > 0
            ? profile.locations
            : [profile.location]
          ).map((loc: string, i: number) => (
            <a key={i}
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`}
              target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#ffefe5]/60 hover:text-[#ff6b35] transition-colors">
              <FaMapMarkerAlt className="text-[#ff6b35]/70 shrink-0" size={11} />
              <span>{loc}</span>
            </a>
          ))}
        </div>
      )}

      {/* ─── RASTREAR PEDIDO (siempre primero en la sección de enlaces) ─── */}
      <div className="px-4 max-w-md mx-auto mt-5">
        <button
          onClick={() => { setTrackCode(null); setShowTracker(true); }}
          className="w-full py-3 rounded-xl bg-white/5 border border-[#ff6b35]/15 hover:border-[#ff6b35]/40 text-[#ffefe5]/80 hover:text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
          <FaClock size={12} /> Rastrear mi pedido
        </button>
      </div>

      {/* ── BOOKING LINK (PRO/ULTRA) ─────────────────────────────── */}
      {isProOrUltra && profile?.bookingLink && (
        <div className="px-4 max-w-md mx-auto mt-5">
          <a href={profile.bookingLink} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider bg-[#ff6b35] hover:bg-[#e85a25] text-white shadow-lg shadow-[#ff6b35]/15 transition-all hover:scale-[1.02] active:scale-95">
            <FaCalendarAlt size={14} />
            Reservar Mesa
          </a>
        </div>
      )}

      {/* ── CUSTOM LINKS (PRO/ULTRA) ─────────────────────────────── */}
      {sectionOn('links') && isProOrUltra && activeLinks.length > 0 && (
        <div className="px-4 max-w-md mx-auto mt-5 space-y-2">
          {activeLinks.map((link: any) => (
            <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => onLinkClick?.(link.id)}
              className="flex items-center justify-center gap-2 w-full py-3 px-5 bg-white/5 border border-[#ff6b35]/10 hover:border-[#ff6b35]/30 rounded-xl text-xs font-bold uppercase tracking-wider text-[#ffefe5] hover:text-[#ff6b35] transition-all hover:scale-[1.01]">
              <FaLink size={10} />
              {link.title}
            </a>
          ))}
        </div>
      )}

      {/* ─── CLUB SECRETO (captura de leads) ─── */}
      <div className="px-4 max-w-md mx-auto mt-6">
        <button
          onClick={() => setShowClub(true)}
          className="group relative w-full overflow-hidden rounded-2xl p-[1px] bg-gradient-to-r from-[#ff6b35] via-[#ffb088] to-[#ff6b35] active:scale-[0.99] transition-transform">
          <div className="relative rounded-2xl bg-[#0f0702] px-5 py-4 flex items-center gap-4 text-left">
            <div className="w-11 h-11 rounded-xl bg-[#ff6b35]/15 flex items-center justify-center text-xl shrink-0">🎁</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white leading-tight">Únete al {clubName}</p>
              <p className="text-[11px] text-[#ffefe5]/60 mt-0.5 leading-snug">
                {clubTagline}
              </p>
            </div>
            <FaGift className="text-[#ff6b35] text-lg shrink-0 group-hover:scale-110 transition-transform" />
          </div>
        </button>
      </div>

      {/* ─── RESERVAR MESA (debajo del club, gastro ULTRA) ─── */}
      {reservationsOn && (
        <div className="px-4 max-w-md mx-auto mt-3">
          <button
            onClick={() => setShowReserve(true)}
            className="group relative w-full overflow-hidden rounded-2xl p-[1px] bg-gradient-to-r from-[#ff6b35] via-[#ffb088] to-[#ff6b35] active:scale-[0.99] transition-transform">
            <div className="relative rounded-2xl bg-[#0f0702] px-5 py-4 flex items-center gap-4 text-left">
              <div className="w-11 h-11 rounded-xl bg-[#ff6b35]/15 flex items-center justify-center text-xl shrink-0">📅</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white leading-tight">Reservar una mesa</p>
                <p className="text-[11px] text-[#ffefe5]/60 mt-0.5 leading-snug">Asegura tu lugar. Elige fecha, hora y número de personas.</p>
              </div>
              <FaCalendarAlt className="text-[#ff6b35] text-lg shrink-0 group-hover:scale-110 transition-transform" />
            </div>
          </button>
        </div>
      )}

      {/* ─── CONSULTA DE MEMBRESÍA (tarjeta única por cliente) ─── */}
      <div className="px-4 max-w-md mx-auto mt-6 mb-3">
        <MembershipLookup
          restaurantId={sellerId}
          isMobilePreview={isMobilePreview}
          clubName={clubName}
          onJoinClick={() => setShowClub(true)}
        />
      </div>

      {/* ─── MENÚ: VISTA PREVIA + VER MENÚ COMPLETO ─── */}
      <div className="px-4 max-w-md mx-auto mb-6 cinema-animate-in-delay-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black uppercase italic tracking-widest text-[#ff6b35] font-mono">Platos Estrella</h2>
          {allProducts.length > 0 && (
            <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{allProducts.length} platos</span>
          )}
        </div>

        {allProducts.length > 0 ? (
          <>
            {/* Selector de categorías (deslizable) */}
            {categoryNames.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
                {categoryNames.map((cat) => (
                  <button key={cat} onClick={() => setSelectedCat(cat)}
                    style={selectedCat === cat ? { backgroundColor: accent, borderColor: 'transparent' } : undefined}
                    className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider shrink-0 border transition-all ${
                      selectedCat === cat
                        ? 'text-white shadow-lg shadow-[#ff6b35]/20'
                        : 'bg-[#ff6b35]/5 border-[#ff6b35]/10 text-gray-400 hover:text-white hover:border-[#ff6b35]/25'
                    }`}>
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Carrusel horizontal de platos (deslizar SOLO aquí) */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-4 px-4 scroll-px-4">
              {(categorizedProducts[selectedCat] || []).map((product) => {
                const agotado = isAgotado(product);
                return (
                  <div key={product.id}
                    onClick={() => openDish(product)}
                    className={`snap-start shrink-0 w-40 rounded-2xl overflow-hidden border bg-white/[0.03] transition-all duration-300 ${
                      agotado ? 'opacity-60 cursor-not-allowed border-[#ff6b35]/5' : 'cursor-pointer border-[#ff6b35]/10 hover:border-[#ff6b35]/30 hover:-translate-y-0.5'
                    }`}>
                    <div className="relative">
                      {product.imageURL ? (
                        <img src={product.imageURL} alt={product.name}
                          className={`w-full h-28 object-cover ${agotado ? 'grayscale' : ''}`} />
                      ) : (
                        <div className="w-full h-28 bg-gradient-to-br from-[#1a0800] to-[#0f0400] flex items-center justify-center text-[#ff6b35]/25">
                          <FaUtensils size={22} />
                        </div>
                      )}
                      {agotado && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-white bg-black/55">Agotado</span>
                      )}
                    </div>
                    <div className="p-3">
                      <h4 className="cnx-product-text font-bold text-xs text-[#ffefe5] truncate leading-snug">{product.cleanName}</h4>
                      {product.shortDescription && (
                        <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2 leading-snug">{product.shortDescription}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        {product.price
                          ? <span className="font-mono text-xs font-black text-[#ff6b35]">{product.price}</span>
                          : <span />}
                        {!agotado && <span className="text-[9px] font-black uppercase tracking-wider text-[#ff6b35]/70">Pedir →</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5 text-center tracking-wide">👈 Desliza para ver más platos 👉</p>

            <button
              onClick={() => { setCatalogQuery(''); setShowFullMenu(true); }}
              style={{ backgroundColor: accent }}
              className="mt-4 w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white shadow-lg transition-all hover:brightness-110 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2">
              <FaUtensils size={12} /> Ver Menú Completo ({allProducts.length})
            </button>
          </>
        ) : (
          <div className="text-center py-10 text-gray-500">
            <FaInbox className="mx-auto text-3xl mb-2" />
            <p className="text-xs">El menú estará disponible pronto.</p>
          </div>
        )}
      </div>

      {/* ── SCHEDULE / OPENING HOURS ────────────────────────────── */}
      {/* El interruptor "Mostrar horarios" se ignoraba aquí: sólo se miraba si
          había datos, así que apagarlo no ocultaba nada. Se oculta cuando está
          explícitamente en false — misma convención que sectionVisibility — para
          que los perfiles que nunca tocaron el ajuste sigan viéndose igual. */}
      {profile?.showSchedule !== false && businessHours.length > 0 && (
        <div className="px-4 max-w-md mx-auto mb-6">
          <div className="bg-white/[0.03] border border-[#ff6b35]/10 rounded-2xl p-5">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-2 mb-4">
              <FaClock size={11} /> Horarios de Atención
            </h3>
            <div className="space-y-2">
              {businessHours.map((day: any, i: number) => (
                <div key={i} className="flex justify-between items-center text-xs py-1 border-b border-white/5 last:border-b-0">
                  <span className="text-[#ffefe5]/80 font-semibold capitalize">{day.day}</span>
                  <span className="text-[#ff6b35] font-bold font-mono">
                    {day.isOpen && day.openTime && day.closeTime
                      ? `${day.openTime} – ${day.closeTime}`
                      : 'Cerrado'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TESTIMONIALS / RESEÑAS (PRO/ULTRA) ──────────────────── */}
      {sectionOn('testimonials') && isProOrUltra && Array.isArray(profile?.testimonials) && profile.testimonials.length > 0 && (
        <div className="px-4 max-w-md mx-auto mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-2">
              <FaStar size={11} /> Lo que dicen nuestros clientes
            </h3>
            <div className="flex items-center gap-0.5 text-[#ff6b35]">
              {Array.from({ length: 5 }).map((_, i) => <FaStar key={i} size={10} />)}
            </div>
          </div>
          <div className="space-y-3.5">
            {profile.testimonials.map((test: any) => (
              <div key={test.id}
                className="relative overflow-hidden rounded-2xl p-[1px] bg-gradient-to-br from-[#ff6b35]/30 via-[#ff6b35]/5 to-transparent">
                <div className="relative rounded-2xl bg-gradient-to-br from-[#160a03] to-[#0c0502] p-5">
                  {/* Comilla decorativa */}
                  <span className="absolute top-2 right-4 text-5xl leading-none font-serif text-[#ff6b35]/15 select-none pointer-events-none">”</span>
                  {/* Estrellas */}
                  <div className="flex items-center gap-0.5 text-[#ff6b35] mb-2.5">
                    {Array.from({ length: 5 }).map((_, i) => <FaStar key={i} size={11} />)}
                  </div>
                  <p className="cnx-testimonial-text italic text-[13px] text-[#ffefe5]/90 leading-relaxed relative z-10">"{test.quote}"</p>
                  <div className="flex items-center gap-3 mt-4 pt-3.5 border-t border-[#ff6b35]/10">
                    {test.authorImageURL ? (
                      <img src={test.authorImageURL} alt={test.author}
                        className="w-9 h-9 rounded-full object-cover border-2 border-[#ff6b35]/40 shadow-lg shadow-[#ff6b35]/10" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#ff6b35]/15 border border-[#ff6b35]/30 flex items-center justify-center text-[#ff6b35] font-black text-sm shrink-0">
                        {String(test.author || '?').charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-black text-xs text-white truncate">{test.author}</p>
                      {test.authorTitle && <p className="text-[10px] text-[#ffefe5]/40 truncate">{test.authorTitle}</p>}
                    </div>
                    <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 shrink-0">
                      ✓ Verificada
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Secciones genéricas (galería, archivos, FAQs) — solo si hay datos */}
      <ProfileExtraSections profile={profile} accent={accent} isMobilePreview={isMobilePreview} />

      {/* Footer */}
      <div className="text-center py-6 opacity-30 text-xs tracking-wider">
        <p>Powered by Connexo © 2026</p>
      </div>

      {/* ─── POPUP DETAIL MODAL WITH ORDER LOGISTICS ─── */}
      {activeOrderModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
             onClick={() => setActiveOrderModal(null)}>
          <div className="bg-[#0f0702] border border-[#ff6b35]/25 w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl relative max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden text-white"
               onClick={(e) => e.stopPropagation()}>

            <div className="relative shrink-0">
              <button onClick={() => setActiveOrderModal(null)}
                className="absolute top-4 right-4 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2.5 transition-colors border border-white/10">
                <FaTimes size={14} />
              </button>
              {activeOrderModal.imageURL && (
                <img src={activeOrderModal.imageURL} alt={activeOrderModal.cleanName}
                  className="w-full h-48 sm:h-56 object-cover border-b border-[#ff6b35]/15" />
              )}
            </div>

            <div className="p-5 overflow-y-auto flex-1">
              <h2 className="text-xl font-bold tracking-tight">{activeOrderModal.cleanName}</h2>
              {activeOrderModal.price && (
                <p className="text-lg font-mono font-black text-[#ff6b35] mt-1">{activeOrderModal.price}</p>
              )}
              <p className="text-xs text-gray-300 mt-3 leading-relaxed whitespace-pre-wrap">
                {activeOrderModal.longDescription || activeOrderModal.shortDescription || "Sin descripción disponible."}
              </p>

              {/* Alérgenos */}
              {activeOrderModal.allergens && String(activeOrderModal.allergens).trim() && (
                <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <FaAllergies className="text-amber-400 shrink-0 mt-0.5" size={13} />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Alérgenos</p>
                    <p className="text-xs text-amber-200/80 mt-0.5 leading-snug">{activeOrderModal.allergens}</p>
                  </div>
                </div>
              )}

              <div className="mt-6 pt-5 border-t border-[#ff6b35]/15 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest text-[#ff6b35]">¿Cómo lo quieres?</h4>

                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setOrderType('mesa')}
                    className={`py-3 px-3 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-1.5 ${
                      orderType === 'mesa'
                        ? 'bg-[#ff6b35]/15 border-[#ff6b35]/40 text-[#ffefe5]'
                        : 'bg-black/30 border-[#ff6b35]/5 text-gray-400'
                    }`}>
                    <FaConciergeBell size={16} /> En Mesa
                  </button>
                  <button type="button" onClick={() => setOrderType('delivery')}
                    className={`py-3 px-3 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-1.5 ${
                      orderType === 'delivery'
                        ? 'bg-[#ff6b35]/15 border-[#ff6b35]/40 text-[#ffefe5]'
                        : 'bg-black/30 border-[#ff6b35]/5 text-gray-400'
                    }`}>
                    <FaMotorcycle size={16} /> Delivery
                  </button>
                </div>

                {orderType === 'mesa' ? (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">Número de Mesa</label>
                    {tableCount > 0 ? (
                      <select value={mesaNumber} onChange={(e) => setMesaNumber(e.target.value)}
                        className="w-full p-3 rounded-xl bg-black/40 border border-[#ff6b35]/20 text-[#ffefe5] focus:outline-none focus:border-[#ff6b35] text-sm">
                        <option value="">Selecciona tu mesa…</option>
                        {Array.from({ length: tableCount }, (_, i) => i + 1).map(n => (
                          <option key={n} value={String(n)}>Mesa {n}</option>
                        ))}
                      </select>
                    ) : (
                      <input type="text" pattern="[0-9]*" inputMode="numeric" value={mesaNumber}
                        onChange={(e) => setMesaNumber(e.target.value)} placeholder="Ej: 5"
                        className="w-full p-3 rounded-xl bg-black/40 border border-[#ff6b35]/20 text-[#ffefe5] placeholder-gray-600 focus:outline-none focus:border-[#ff6b35] text-sm" />
                    )}
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <input type="text" value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Tu nombre *"
                      className="w-full p-3 rounded-xl bg-black/40 border border-[#ff6b35]/20 text-[#ffefe5] placeholder-gray-600 focus:outline-none focus:border-[#ff6b35] text-sm" />
                    <input type="tel" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Teléfono / WhatsApp *"
                      className="w-full p-3 rounded-xl bg-black/40 border border-[#ff6b35]/20 text-[#ffefe5] placeholder-gray-600 focus:outline-none focus:border-[#ff6b35] text-sm" />
                    <textarea value={custAddress} onChange={(e) => setCustAddress(e.target.value)} placeholder="Dirección de entrega *" rows={2}
                      className="w-full p-3 rounded-xl bg-black/40 border border-[#ff6b35]/20 text-[#ffefe5] placeholder-gray-600 focus:outline-none focus:border-[#ff6b35] text-sm resize-none" />
                  </div>
                )}

                <div className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-[#ff6b35]/10">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Cantidad</span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))}
                      className="w-8 h-8 rounded-lg bg-white/5 border border-[#ff6b35]/10 flex items-center justify-center text-sm font-black active:bg-white/10">
                      -
                    </button>
                    <span className="font-mono font-bold text-sm w-4 text-center">{quantity}</span>
                    <button type="button" onClick={() => setQuantity(q => q + 1)}
                      className="w-8 h-8 rounded-lg bg-white/5 border border-[#ff6b35]/10 flex items-center justify-center text-sm font-black active:bg-white/10">
                      +
                    </button>
                  </div>
                </div>

                {/* ── Código de miembro VIP (descuentos) ── */}
                <div className="pt-4 border-t border-[#ff6b35]/15">
                  <label className="block text-[10px] font-black uppercase tracking-wider text-[#ff6b35] mb-2 flex items-center gap-1.5">
                    <FaStar size={10} /> ¿Eres miembro VIP? Aplica tu código
                  </label>
                  <div className="flex gap-2">
                    <input type="text" value={memberCode}
                      onChange={(e) => { setMemberCode(e.target.value); setMemberChecked(false); setMemberInfo(null); }}
                      placeholder="Tu código de miembro"
                      className="flex-1 p-3 rounded-xl bg-black/40 border border-[#ff6b35]/20 text-[#ffefe5] placeholder-gray-600 focus:outline-none focus:border-[#ff6b35] text-sm uppercase tracking-widest font-mono" />
                    <button type="button" onClick={applyMemberCode} disabled={!memberCode.trim() || checkingMember}
                      className="px-4 rounded-xl bg-[#ff6b35]/15 border border-[#ff6b35]/30 text-[#ff6b35] text-xs font-black uppercase tracking-wider hover:bg-[#ff6b35]/25 disabled:opacity-40 transition">
                      {checkingMember ? '...' : 'Aplicar'}
                    </button>
                  </div>
                  {memberChecked && memberInfo?.found && (
                    <div className="mt-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center gap-2">
                      ✅ {memberInfo.is_vip ? 'VIP' : 'Miembro'} {memberInfo.name ? `· ${memberInfo.name}` : ''}
                      {memberDiscount > 0 ? ` · ${memberDiscount}% de descuento aplicado` : ' · sin descuento activo'}
                    </div>
                  )}
                  {memberChecked && !memberInfo?.found && (
                    <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-[#ff6b35]/15 text-xs text-gray-300 flex items-center justify-between gap-2">
                      <span>No encontramos ese código.</span>
                      <button type="button" onClick={() => { setActiveOrderModal(null); setShowClub(true); }}
                        className="text-[#ff6b35] font-black uppercase tracking-wider text-[10px] hover:text-[#ff8f61] shrink-0">
                        Únete al Club →
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-[#ff6b35]/15 shrink-0 bg-black/30">
              {memberDiscount > 0 && (
                <div className="flex items-center justify-between mb-2 text-xs">
                  <span className="text-gray-400 line-through">${dishBase.toFixed(2)}</span>
                  <span className="text-emerald-400 font-bold">-{memberDiscount}% VIP</span>
                  <span className="text-white font-black">${dishTotal.toFixed(2)}</span>
                </div>
              )}
              <button type="button" onClick={handlePlaceOrder} disabled={ordering}
                style={{ backgroundColor: accent }}
                className="w-full py-4 text-center font-black text-xs uppercase tracking-widest text-white rounded-xl shadow-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
                {ordering
                  ? 'Procesando...'
                  : orderType === 'mesa'
                    ? <><FaConciergeBell size={13} /> Pedir al Mesero · ${dishTotal.toFixed(2)}</>
                    : <><FaMotorcycle size={13} /> Ordenar Delivery · ${dishTotal.toFixed(2)}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SUCCESS SCREEN MODAL ─── */}
      {successOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
             onClick={() => setSuccessOrder(null)}>
          <div className="bg-[#0f0702] border-2 border-green-500/30 w-full max-w-md rounded-2xl shadow-2xl relative p-6 flex flex-col items-center text-center"
               onClick={(e) => e.stopPropagation()}>

            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 mb-4 border border-green-500/20">
              <FaCheckCircle size={28} />
            </div>

            <h3 className="text-xl font-bold font-sans text-white">¡Pedido Registrado!</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed px-4">
              Tu orden ha sido enviada al personal de cocina. Muestra esta pantalla al mesero para validar y acreditar tus sellos.
            </p>

            <div className="my-6 p-4 rounded-xl bg-black/40 border border-[#ff6b35]/20 w-full">
              <div className="text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-1">Código de Validación</div>
              <div className="text-3xl font-mono font-black tracking-widest text-[#ff6b35]">{successOrder.verification_code}</div>
              {successOrder.order_type === 'mesa' ? (
                <div className="text-xs text-gray-400 mt-1 font-bold">Mesa {successOrder.mesa_number}</div>
              ) : (
                <div className="text-xs text-gray-400 mt-1 font-bold">Delivery{successOrder.customer_name ? ` · ${successOrder.customer_name}` : ''}</div>
              )}
            </div>

            <div className="bg-white p-3.5 rounded-2xl my-2 border border-white/10">
              <QRCodeCanvas
                value={`${(typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '')}?pedido=${successOrder.verification_code}`}
                size={160} level="M" includeMargin={true} bgColor="#ffffff" />
            </div>

            <div className="mt-4 w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-left">
              <p className="text-[11px] text-amber-200/90 font-bold leading-snug">
                💵 Total a pagar: <span className="text-white">${Number(successOrder.total_price ?? 0).toFixed(2)} USD</span>
              </p>
              <p className="text-[10px] text-amber-200/60 mt-1 leading-snug">
                Tu pedido pasa a <b>Preparando</b> cuando el restaurante confirma tu pago. Envía tu comprobante por WhatsApp:
              </p>
            </div>

            {/* ── Opciones de pago activas (según pasarelas configuradas) ─────── */}
            {(() => {
              const code = successOrder.verification_code;
              const amount = Number(successOrder.total_price ?? 0);
              const proofPhone = gwCfg.whatsapp?.phone || profile?.whatsapp || profile?.phone || '';
              const bt = gwCfg.bankTransfer;
              const proofMsg = `¡Hola ${profile?.displayName || ''}! Adjunto el comprobante de pago de mi pedido #${code} por $${amount.toFixed(2)} USD.`;
              const sendProof = async () => {
                window.open(ecWaLink(proofPhone, proofMsg), '_blank');
                if (!isMobilePreview && sellerId) {
                  try { await supabase.rpc('notify_gastro_payment', { p_restaurant_id: sellerId, p_code: code }); } catch (e) { console.error(e); }
                }
              };
              return (
                <div className="mt-3 w-full space-y-2 text-left">
                  {/* Link Directo / Botón de Pago */}
                  {gwCfg.directLink?.enabled && gwCfg.directLink?.url?.trim() && (
                    <a href={`${gwCfg.directLink.url}${gwCfg.directLink.url.includes('?') ? '&' : '?'}amount=${amount.toFixed(2)}&order_id=${code}`}
                      target="_blank" rel="noopener noreferrer"
                      className="w-full py-3.5 bg-[#ff6b35] hover:bg-[#e85a25] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                      <FaLink size={13} /> {gwCfg.directLink.name?.trim() || 'Pagar en línea'}
                    </a>
                  )}

                  {/* PayPhone / Pasarela API */}
                  {gwCfg.payphone?.enabled && (
                    <div className="space-y-1">
                      <button type="button" onClick={() => handlePayphone(amount, code, successOrder.customer_name || '')} disabled={payphoneBusy}
                        className="w-full py-3.5 bg-[#ff6b35] hover:bg-[#e85a25] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                        <FaMobileAlt size={13} /> {payphoneBusy ? 'Iniciando...' : 'Pagar con PayPhone'}
                      </button>
                      {payphoneMsg && <p className="text-[10px] text-amber-300/80 px-1 leading-snug">{payphoneMsg}</p>}
                    </div>
                  )}

                  {/* Transferencia Bancaria */}
                  {gwCfg.bankTransfer?.enabled && (bt?.bank || bt?.accountNumber) && (
                    <div className="bg-black/40 border border-[#ff6b35]/20 rounded-xl p-3.5 space-y-1.5">
                      <p className="text-xs font-black text-white flex items-center gap-2"><FaUniversity className="text-[#ff6b35]" /> Transferencia bancaria</p>
                      <div className="text-[11px] text-white/70 space-y-1 pt-1">
                        {bt?.bank && <div className="flex justify-between gap-2"><span className="text-white/40">Banco</span><span className="font-semibold text-white text-right">{bt.bank}</span></div>}
                        {bt?.accountType && <div className="flex justify-between gap-2"><span className="text-white/40">Tipo</span><span className="font-semibold text-white text-right">{bt.accountType}</span></div>}
                        {bt?.accountNumber && (
                          <div className="flex justify-between gap-2 items-center"><span className="text-white/40">N° cuenta</span>
                            <button type="button" onClick={() => copyAccount(bt.accountNumber!)} className="font-mono font-semibold text-white text-right flex items-center gap-1.5 hover:text-[#ff6b35] transition">
                              {bt.accountNumber} <FaCopy className="text-[10px] opacity-60" />{copiedAcc && <span className="text-[10px] text-[#ff6b35]">¡Copiado!</span>}
                            </button>
                          </div>
                        )}
                        {bt?.holder && <div className="flex justify-between gap-2"><span className="text-white/40">Titular</span><span className="font-semibold text-white text-right">{bt.holder}</span></div>}
                        {bt?.idNumber && <div className="flex justify-between gap-2"><span className="text-white/40">Cédula/RUC</span><span className="font-semibold text-white text-right">{bt.idNumber}</span></div>}
                        {bt?.email && <div className="flex justify-between gap-2"><span className="text-white/40">Email</span><span className="font-semibold text-white text-right break-all">{bt.email}</span></div>}
                      </div>
                      {proofPhone && (
                        <button type="button" onClick={sendProof}
                          className="mt-2 w-full py-2.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2">
                          <FaWhatsapp size={13} /> Enviar comprobante
                        </button>
                      )}
                    </div>
                  )}

                  {/* WhatsApp / Pago Manual */}
                  {gwCfg.whatsapp?.enabled && proofPhone && (
                    <button type="button" onClick={sendProof}
                      className="w-full py-3.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                      <FaWhatsapp size={14} /> Enviar comprobante de pago
                    </button>
                  )}

                  {/* Fallback: sin pasarelas configuradas → comprobante por WhatsApp del perfil */}
                  {!hasGateways && (
                    <button type="button" onClick={sendProof}
                      className="w-full py-3.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                      <FaWhatsapp size={14} /> Pagar · Enviar comprobante
                    </button>
                  )}
                </div>
              );
            })()}
            <button type="button"
              onClick={() => setInvoiceCode(successOrder.verification_code)}
              className="mt-2 w-full py-3 bg-white/5 hover:bg-white/10 border border-[#ff6b35]/20 text-[#ffefe5] rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2">
              🧾 ¿Necesitas factura?
            </button>
            <button type="button"
              onClick={() => { const c = successOrder.verification_code; setSuccessOrder(null); setTrackCode(c); setShowTracker(true); }}
              className="mt-2 w-full py-3.5 bg-[#ff6b35] hover:bg-[#e85a25] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2">
              <FaClock size={12} /> Ver estado de mi pedido en vivo
            </button>
            <button type="button" onClick={() => setSuccessOrder(null)}
              className="mt-2 w-full py-3 bg-white/5 hover:bg-white/10 border border-[#ff6b35]/20 text-[#ffefe5] rounded-xl text-xs font-black uppercase tracking-wider transition-all">
              Cerrar Pantalla
            </button>
          </div>
        </div>
      )}

      {/* ─── FULL MENU MODAL (categorías: platos fuertes, postres, etc.) ─── */}
      {showFullMenu && (
        <FullCatalogView
          items={catalogItems}
          onBack={() => setShowFullMenu(false)}
          onSelect={(raw) => { setShowFullMenu(false); openDish(raw); }}
          accent={accent}
          bg="#0b0502"
          text="#ffefe5"
          fontFamily={profile?.fontFamily}
          title="Menú Completo"
          searchPlaceholder="Buscar un plato, categoría o ingrediente"
          emptyLabel="El menú estará disponible pronto."
          ctaLabel="Pedir →"
          isMobilePreview={isMobilePreview}
        />
      )}

      {/* ─── CLUB SECRETO MODAL (captura de leads) ─── */}
      {showClub && (
        <ClubSecretoModal
          restaurantId={sellerId}
          isMobilePreview={isMobilePreview}
          clubName={clubName}
          clubTagline={clubTagline}
          onClose={() => setShowClub(false)}
        />
      )}

      {/* ─── RESERVA DE MESA MODAL (gastro ULTRA) ─── */}
      {showReserve && (
        <ReserveModal
          restaurantId={sellerId}
          isMobilePreview={isMobilePreview}
          settings={profile?.reservationSettings || {}}
          restaurantName={profile?.displayName}
          dishes={availableDishes}
          accent={accent}
          onClose={() => setShowReserve(false)}
        />
      )}

      {/* ─── RASTREADOR DE PEDIDO EN VIVO ─── */}
      {showTracker && (
        <OrderTracker
          restaurantId={sellerId}
          initialCode={trackCode}
          isMobilePreview={isMobilePreview}
          waPhone={gwCfg.whatsapp?.phone || profile?.whatsapp || profile?.phone || ''}
          restaurantName={profile?.displayName}
          payLink={(gwCfg.directLink?.enabled && gwCfg.directLink?.url?.trim()) ? gwCfg.directLink.url : profile?.paymentLink}
          onInvoice={(c) => setInvoiceCode(c)}
          onClose={() => { setShowTracker(false); setTrackCode(null); }}
        />
      )}

      {/* ─── FACTURA ─── */}
      {invoiceCode && (
        <InvoiceModal
          restaurantId={sellerId}
          code={invoiceCode}
          isMobilePreview={isMobilePreview}
          onClose={() => setInvoiceCode(null)}
        />
      )}

    </div>
  );
};

// ─── Rastreador de pedido: el cliente ve el estado en vivo por código ────────
const ORDER_META: Record<string, { label: string; emoji: string }> = {
  pendiente:  { label: 'Recibido',   emoji: '📝' },
  preparando: { label: 'Preparando', emoji: '👨‍🍳' },
  listo:      { label: 'Listo',      emoji: '🔔' },
  en_camino:  { label: 'En camino',  emoji: '🛵' },
  entregado:  { label: 'Entregado',  emoji: '✅' },
  completado: { label: 'Entregado',  emoji: '✅' },
  cancelado:  { label: 'Cancelado',  emoji: '❌' },
};

// Estados de una reserva (cuando el código corresponde a una reserva, no a un pedido).
const RES_META: Record<string, { label: string; emoji: string; cls: string }> = {
  pendiente:  { label: 'Pendiente de confirmación', emoji: '⏳', cls: 'bg-amber-500/10 border-amber-500/25 text-amber-200/90' },
  confirmada: { label: 'Reserva confirmada',        emoji: '✅', cls: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' },
  sentada:    { label: '¡Tu mesa está lista!',      emoji: '🍽️', cls: 'bg-blue-500/10 border-blue-500/25 text-blue-300' },
  cancelada:  { label: 'Reserva cancelada',         emoji: '❌', cls: 'bg-red-500/10 border-red-500/25 text-red-300' },
  no_show:    { label: 'Reserva no asistida',       emoji: '🚫', cls: 'bg-white/5 border-white/10 text-gray-300' },
};

const OrderTracker: React.FC<{
  restaurantId: string | null;
  initialCode: string | null;
  isMobilePreview: boolean;
  waPhone?: string;
  restaurantName?: string;
  payLink?: string;
  onInvoice?: (code: string) => void;
  onClose: () => void;
}> = ({ restaurantId, initialCode, isMobilePreview, waPhone, restaurantName, payLink, onInvoice, onClose }) => {
  const [code, setCode] = useState(initialCode || '');
  const [tracking, setTracking] = useState(!!initialCode);
  const [data, setData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchStatus = useCallback(async (c: string) => {
    if (isMobilePreview) { setData({ kind: 'order', found: true, status: 'preparando', order_type: 'mesa', estimated_minutes: 15, code: c }); return; }
    if (!restaurantId || !c) return;
    try {
      // 1) ¿Es un pedido?
      const { data: d } = await supabase.rpc('get_order_status', { p_restaurant_id: restaurantId, p_code: c.trim() });
      if (d && d.found) { setData({ ...d, kind: 'order' }); setNotFound(false); return; }
      // 2) Si no, ¿es una reserva?
      const { data: r } = await supabase.rpc('get_gastro_reservation_status', { p_restaurant_id: restaurantId, p_code: c.trim() });
      if (r && r.found) { setData({ ...r, kind: 'reservation' }); setNotFound(false); return; }
      setNotFound(true); setData(null);
    } catch (e) { console.error('tracker error:', e); setNotFound(true); }
  }, [restaurantId, isMobilePreview]);

  useEffect(() => {
    if (!tracking || !code) return;
    fetchStatus(code);
    const id = setInterval(() => fetchStatus(code), 6000);
    return () => clearInterval(id);
  }, [tracking, code, fetchStatus]);

  const steps = (data?.order_type === 'delivery')
    ? ['pendiente', 'preparando', 'listo', 'en_camino', 'entregado']
    : ['pendiente', 'preparando', 'listo', 'entregado'];
  const currentIdx = data ? steps.indexOf(data.status === 'completado' ? 'entregado' : data.status) : -1;
  const cancelled = data?.status === 'cancelado';

  return (
    <div className="fixed inset-0 z-[118] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0f0702] rounded-2xl border border-[#ff6b35]/30 shadow-2xl p-6 relative"
           onClick={(e) => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition"><FaTimes size={16} /></button>
        <h3 className="text-base font-black text-white flex items-center gap-2 mb-4"><FaClock className="text-[#ff6b35]" /> Estado de tu pedido o reserva</h3>

        {!tracking ? (
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) setTracking(true); }} className="space-y-3">
            <p className="text-xs text-gray-400">Ingresa el código de tu pedido o de tu reserva.</p>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código (ej. A3F9C)"
              className="w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600 uppercase tracking-widest font-mono" />
            <button type="submit" disabled={!code.trim()}
              className="w-full py-3 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all">
              Ver estado
            </button>
          </form>
        ) : notFound ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-4xl">🔍</div>
            <p className="text-sm text-gray-400">No encontramos un pedido ni una reserva con ese código.</p>
            <button onClick={() => { setTracking(false); setNotFound(false); }}
              className="text-[11px] font-black uppercase tracking-wider text-[#ff6b35] hover:text-[#ff8f61]">Intentar con otro código</button>
          </div>
        ) : !data ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#ff6b35]" /></div>
        ) : data.kind === 'reservation' ? (
          (() => {
            const rm = RES_META[data.status] || RES_META.pendiente;
            const dateLabel = data.reservation_date
              ? new Date(data.reservation_date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long' })
              : '';
            return (
              <div className="space-y-4">
                <div className="text-center">
                  <div className="text-4xl">{rm.emoji}</div>
                  <p className="text-lg font-black text-white mt-1">{rm.label}</p>
                  <p className="text-[10px] text-gray-500 mt-1 font-mono tracking-widest">Reserva · Código {data.code}</p>
                </div>

                {/* Detalle de la reserva */}
                <div className="rounded-xl bg-black/30 border border-[#ff6b35]/15 divide-y divide-white/5">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-gray-400">Fecha</span>
                    <span className="text-xs font-bold text-white capitalize">{dateLabel} · {data.reservation_time}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-gray-400">Personas</span>
                    <span className="text-xs font-bold text-white">{data.party_size}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs text-gray-400">Mesa asignada</span>
                    <span className="text-xs font-bold text-white">{data.table_number ? `Mesa ${data.table_number}` : 'Por asignar'}</span>
                  </div>
                </div>

                {/* Estado de confirmación */}
                <div className={`p-2.5 rounded-xl border text-xs font-bold text-center ${rm.cls}`}>
                  {data.status === 'pendiente' && '⏳ El restaurante revisará y confirmará tu reserva.'}
                  {data.status === 'confirmada' && '✅ ¡Tu reserva está confirmada! Te esperamos.'}
                  {data.status === 'sentada' && '🍽️ Estás registrado en tu mesa. ¡Disfruta!'}
                  {data.status === 'cancelada' && '❌ Esta reserva fue cancelada.'}
                  {data.status === 'no_show' && '🚫 Esta reserva quedó como no asistida.'}
                </div>

                {/* Estado de pago */}
                <div className={`p-2.5 rounded-xl border text-xs font-bold text-center ${data.payment_status === 'pagado' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-amber-500/10 border-amber-500/25 text-amber-200/90'}`}>
                  {data.payment_status === 'pagado' ? '💳 Pago confirmado' : '💵 Pago pendiente (se paga en el local)'}
                </div>

                {/* Pre-pedido si lo hizo */}
                {Array.isArray(data.preorder_items) && data.preorder_items.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#ff6b35]/10 border border-[#ff6b35]/20">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#ff6b35] mb-1.5">Tu pre-pedido</p>
                    <div className="space-y-1">
                      {data.preorder_items.map((it: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs text-[#ffefe5]/85">
                          <span>{it.qty}x {it.name}</span>
                          {it.price && <span className="font-mono text-[#ff6b35]">{it.price}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-gray-500 text-center">Esta pantalla se actualiza sola cada pocos segundos.</p>
              </div>
            );
          })()
        ) : cancelled ? (
          <div className="text-center py-4 space-y-2">
            <div className="text-4xl">❌</div>
            <p className="text-sm font-black text-red-400">Pedido cancelado</p>
            <p className="text-xs text-gray-500">Código {data.code}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <div className="text-4xl">{ORDER_META[data.status]?.emoji ?? '🍽️'}</div>
              <p className="text-lg font-black text-white mt-1">{ORDER_META[data.status]?.label ?? data.status}</p>
              {data.estimated_minutes ? (
                <p className="text-xs text-[#ff6b35] font-bold mt-0.5">Tiempo estimado: {data.estimated_minutes} min</p>
              ) : null}
              <p className="text-[10px] text-gray-500 mt-1 font-mono tracking-widest">Código {data.code}</p>
            </div>

            {/* Estado del pago — una vez confirmado (o el pedido avanzó), ya no se pide comprobante */}
            {(data.payment_status === 'pagado' || data.status !== 'pendiente') ? (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-bold text-center">
                ✅ Pago confirmado
              </div>
            ) : data.payment_status === 'comprobante' ? (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200/90 text-xs font-bold text-center">
                ⏳ Comprobante recibido — esperando que el restaurante confirme tu pago.
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                <p className="text-[11px] text-amber-200/90 font-bold text-center">
                  💵 Pago pendiente. Envía tu comprobante para que tu pedido avance a Preparando.
                </p>
                <p className="text-center text-white font-black text-sm">${Number(data.total_price ?? 0).toFixed(2)} USD</p>
                {payLink && (
                  <a href={payLink} target="_blank" rel="noopener noreferrer"
                    className="w-full py-2.5 rounded-lg bg-[#ff6b35] hover:bg-[#e85a25] text-white text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2">
                    💳 Pagar en línea
                  </a>
                )}
                <button
                  onClick={async () => {
                    window.open(ecWaLink(waPhone, `¡Hola ${restaurantName || ''}! Adjunto el comprobante de pago de mi pedido #${data.code} por $${Number(data.total_price ?? 0).toFixed(2)} USD.`), '_blank');
                    if (!isMobilePreview && restaurantId) {
                      try { await supabase.rpc('notify_gastro_payment', { p_restaurant_id: restaurantId, p_code: data.code }); fetchStatus(data.code); } catch (e) { console.error(e); }
                    }
                  }}
                  className="w-full py-2.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2">
                  <FaWhatsapp size={13} /> {payLink ? 'O envía tu comprobante' : 'Pagar · Enviar comprobante'}
                </button>
              </div>
            )}

            {/* Pipeline */}
            <div className="flex items-center justify-between gap-1">
              {steps.map((s, i) => {
                const done = i <= currentIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm border transition-all ${done ? 'bg-[#ff6b35] border-[#ff6b35] text-white' : 'bg-black/40 border-white/10 text-gray-600'}`}>
                        {done ? '✓' : i + 1}
                      </div>
                      <span className={`text-[8px] uppercase tracking-wide text-center ${done ? 'text-[#ff6b35] font-bold' : 'text-gray-600'}`}>{ORDER_META[s]?.label}</span>
                    </div>
                    {i < steps.length - 1 && <div className={`h-0.5 flex-1 ${i < currentIdx ? 'bg-[#ff6b35]' : 'bg-white/10'}`} />}
                  </React.Fragment>
                );
              })}
            </div>

            {onInvoice && (
              <button onClick={() => onInvoice(data.code)}
                className="w-full py-2.5 rounded-lg bg-white/5 border border-[#ff6b35]/20 text-[#ffefe5] text-xs font-black uppercase tracking-wider hover:bg-white/10 transition">
                🧾 ¿Necesitas factura?
              </button>
            )}
            <p className="text-[10px] text-gray-500 text-center">Esta pantalla se actualiza sola cada pocos segundos.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Factura: el cliente pide factura con sus datos (o autocompleta si es miembro) ─
const InvoiceModal: React.FC<{
  restaurantId: string | null;
  code: string;
  isMobilePreview: boolean;
  onClose: () => void;
}> = ({ restaurantId, code, isMobilePreview, onClose }) => {
  const [fullName, setFullName] = useState('');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [memberCode, setMemberCode] = useState('');
  const [loadingMember, setLoadingMember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const prefillFromMember = async () => {
    if (!memberCode.trim() || loadingMember) return;
    setLoadingMember(true);
    try {
      const { data } = await supabase.rpc('get_gastro_member', { p_restaurant_id: restaurantId, p_identifier: memberCode.trim() });
      if (data && data.found) {
        if (data.billing_full_name) setFullName(data.billing_full_name);
        else if (data.name) setFullName(data.name);
        if (data.billing_name) setName(data.billing_name);
        if (data.billing_tax_id) setTaxId(data.billing_tax_id);
        if (data.billing_phone) setPhone(data.billing_phone);
        if (data.billing_email) setEmail(data.billing_email);
        if (data.billing_address) setAddress(data.billing_address);
        if (!data.billing_name && !data.billing_tax_id) setErrorMsg('Miembro encontrado, pero sin datos de factura guardados. Complétalos abajo.');
        else setErrorMsg(null);
      } else {
        setErrorMsg('No encontramos ese código de miembro.');
      }
    } catch (e) { console.error(e); }
    finally { setLoadingMember(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !name.trim() || !taxId.trim() || !phone.trim() || submitting) return;
    if (isMobilePreview) { setDone(true); return; }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('submit_gastro_invoice', {
        p_restaurant_id: restaurantId, p_code: code,
        p_name: name.trim(), p_tax_id: taxId.trim(), p_email: email.trim() || null, p_address: address.trim() || null,
        p_full_name: fullName.trim(), p_phone: phone.trim(),
      });
      if (error) throw error;
      if (!data?.ok) { setErrorMsg('No encontramos tu pedido. Verifica el código.'); setSubmitting(false); return; }
      setDone(true);
    } catch (err: any) {
      console.error('submit_gastro_invoice error:', err);
      setErrorMsg(err?.message ? `No se pudo enviar: ${err.message}` : 'No se pudo enviar. Intenta de nuevo.');
    } finally { setSubmitting(false); }
  };

  const inp = "w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600";

  return (
    <div className="fixed inset-0 z-[122] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0f0702] rounded-2xl border border-[#ff6b35]/30 shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition"><FaTimes size={16} /></button>
        <h3 className="text-base font-black text-white flex items-center gap-2 mb-1">🧾 Solicitar factura</h3>
        <p className="text-[11px] text-gray-400 mb-4">Pedido <span className="font-mono text-[#ff6b35]">{code}</span></p>

        {done ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-5xl">✅</div>
            <h4 className="text-base font-black text-white">¡Datos enviados!</h4>
            <p className="text-sm text-gray-400">El restaurante recibió tus datos y emitirá tu factura.</p>
            <button onClick={onClose} className="w-full mt-2 py-3 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-wider transition-all">Cerrar</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Autocompletar si ya es miembro */}
            <div className="flex gap-2">
              <input value={memberCode} onChange={(e) => setMemberCode(e.target.value)} placeholder="¿Eres miembro? Tu código"
                className={`${inp} uppercase tracking-widest font-mono`} />
              <button type="button" onClick={prefillFromMember} disabled={!memberCode.trim() || loadingMember}
                className="px-4 rounded-xl bg-[#ff6b35]/15 border border-[#ff6b35]/30 text-[#ff6b35] text-xs font-black uppercase hover:bg-[#ff6b35]/25 disabled:opacity-40 transition shrink-0">
                {loadingMember ? '...' : 'Usar'}
              </button>
            </div>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre completo *" className={inp} />
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre / Razón social (factura) *" className={inp} />
            <input required value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Cédula / RUC *" className={inp} />
            <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono *" className={inp} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inp} />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección" className={inp} />
            {errorMsg && <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-200 text-[11px] font-bold text-center">{errorMsg}</div>}
            <button type="submit" disabled={submitting || !fullName.trim() || !name.trim() || !taxId.trim() || !phone.trim()}
              className="w-full py-3.5 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-widest disabled:opacity-50 transition-all">
              {submitting ? 'Enviando...' : 'Enviar datos de factura'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ─── Consulta de membresía: el cliente ingresa email/teléfono y ve su tarjeta ─
const MembershipLookup: React.FC<{
  restaurantId: string | null;
  isMobilePreview: boolean;
  clubName?: string;
  onJoinClick: () => void;
}> = ({ restaurantId, isMobilePreview, clubName = 'Club Secreto', onJoinClick }) => {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);
  const [notFound, setNotFound] = useState(false);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || loading) return;
    setNotFound(false);
    setResult(null);

    if (isMobilePreview) {
      setResult({ found: true, member_code: 'DEMO12', name: 'Cliente Demo', is_vip: true, discount_percent: 10, visits: 3 });
      return;
    }
    if (!restaurantId) { setNotFound(true); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_gastro_member', {
        p_restaurant_id: restaurantId,
        p_identifier: identifier.trim(),
      });
      if (error) throw error;
      if (data && data.found) setResult(data);
      else setNotFound(true);
    } catch (err: any) {
      console.error('get_gastro_member error:', err);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  };

  // Tarjeta de membresía encontrada
  if (result?.found || result?.member_code) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a0c02] via-[#0f0400] to-[#240a00] border border-[#ff6b35]/30 p-5 shadow-2xl shadow-[#ff6b35]/5">
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#ff6b35]/15 rounded-full blur-3xl pointer-events-none" />
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="text-[10px] uppercase font-bold tracking-widest text-[#ff6b35]/80">Connexo Pass</div>
            <h3 className="text-base font-bold text-white mt-0.5">{result.name || 'Tu Membresía'}</h3>
          </div>
          {result.is_vip && (
            <div className="px-2.5 py-1 rounded-lg bg-[#ff6b35]/15 border border-[#ff6b35]/30 text-[9px] text-[#ff6b35] font-black uppercase tracking-widest">
              ⭐ VIP
            </div>
          )}
        </div>
        <div className="p-4 rounded-xl bg-black/40 border border-[#ff6b35]/20 text-center">
          <div className="text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-1">Tu código de miembro</div>
          <div className="text-3xl font-mono font-black tracking-[0.3em] text-[#ff6b35]">{result.member_code}</div>
        </div>
        <div className="mt-3">
          <MemberPlanBadge ownerId={restaurantId} identifier={result.member_code} system="gastro" accent="#ff6b35" />
        </div>
        <div className="flex items-center justify-between mt-3 text-xs">
          <span className="text-gray-400">{result.visits ?? 0} visita{(result.visits ?? 0) !== 1 ? 's' : ''}</span>
          {result.discount_percent ? (
            <span className="text-emerald-400 font-bold">{result.discount_percent}% de descuento activo</span>
          ) : (
            <span className="text-gray-500 italic">Sigue visitándonos para más beneficios</span>
          )}
        </div>

        {/* Beneficios activos (los define el restaurante) */}
        {result.benefits && String(result.benefits).trim() && (
          <div className="mt-3 p-3 rounded-xl bg-[#ff6b35]/10 border border-[#ff6b35]/20">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#ff6b35] mb-1">🎁 Tus beneficios</p>
            <p className="text-xs text-[#ffefe5]/85 leading-snug whitespace-pre-wrap">{result.benefits}</p>
          </div>
        )}

        {/* Movimientos (historial de pedidos) */}
        {Array.isArray(result.movements) && result.movements.length > 0 && (
          <div className="mt-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Tus movimientos</p>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {result.movements.map((m: any, i: number) => (
                <div key={i} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-[11px] font-mono font-bold text-[#ff6b35]">{m.code}</span>
                    <span className="text-[10px] text-gray-500 ml-2">{m.order_type === 'delivery' ? '🛵' : '🍽️'} {new Date(m.created_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-white">${Number(m.total ?? 0).toFixed(2)}</div>
                    <div className="text-[9px] text-gray-500 capitalize">{m.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <button onClick={() => { setResult(null); setIdentifier(''); }}
          className="mt-3 w-full py-2 text-[11px] text-gray-500 hover:text-gray-300 transition">
          Consultar otra membresía
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a0c02] via-[#0f0400] to-[#240a00] border border-[#ff6b35]/30 p-5 shadow-2xl shadow-[#ff6b35]/5">
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#ff6b35]/15 rounded-full blur-3xl pointer-events-none" />
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="text-[10px] uppercase font-bold tracking-widest text-[#ff6b35]/80">Connexo Pass</div>
          <h3 className="text-base font-bold text-white mt-0.5">Mi Tarjeta de Fidelidad</h3>
        </div>
        <div className="px-2.5 py-1 rounded-lg bg-[#ff6b35]/10 border border-[#ff6b35]/20 text-[9px] text-[#ff6b35] font-black uppercase tracking-widest">
          Gastro VIP
        </div>
      </div>
      <p className="text-xs text-gray-400 mb-3 leading-relaxed">
        ¿Ya eres miembro? Ingresa tu código, email o teléfono para ver tu tarjeta y tus beneficios.
      </p>
      <form onSubmit={handleLookup} className="space-y-2.5">
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="Tu código, email o teléfono"
          className="w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600" />
        <button type="submit" disabled={loading || !identifier.trim()}
          className="w-full py-3 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95">
          {loading ? 'Buscando...' : 'Ver mi membresía'}
        </button>
      </form>
      {notFound && (
        <div className="mt-3 text-center">
          <p className="text-[11px] text-gray-400 mb-2">No encontramos esa membresía.</p>
          <button onClick={onJoinClick}
            className="text-[11px] font-black uppercase tracking-wider text-[#ff6b35] hover:text-[#ff8f61] transition">
            🎁 Únete al {clubName} →
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Club Secreto: captura nombre/email/teléfono para campañas ───────────────
const ClubSecretoModal: React.FC<{
  restaurantId: string | null;
  isMobilePreview: boolean;
  clubName?: string;
  clubTagline?: string;
  onClose: () => void;
}> = ({ restaurantId, isMobilePreview, clubName = 'Club Secreto', clubTagline = 'Beneficio de bienvenida + ofertas exclusivas', onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [member, setMember] = useState<{ member_code?: string; is_vip?: boolean; discount_percent?: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || submitting) return;
    if (isMobilePreview) { setMember({ member_code: 'DEMO12' }); setDone(true); return; }
    if (!restaurantId) { setErrorMsg('No se pudo identificar el restaurante. Recarga la página.'); return; }

    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('join_gastro_club', {
        p_restaurant_id: restaurantId,
        p_name: name.trim(),
        p_email: email.trim(),
        p_phone: phone.trim() || null,
      });
      if (error) throw error;
      setMember(data || null);
      setDone(true);
    } catch (err: any) {
      console.error('join_gastro_club error:', err);
      setErrorMsg(err?.message ? `No se pudo registrar: ${err.message}` : 'No se pudo registrar. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
         onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0f0702] rounded-2xl border border-[#ff6b35]/30 shadow-2xl shadow-[#ff6b35]/10 p-6 relative"
           onClick={(e) => e.stopPropagation()}
           style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition">
          <FaTimes size={16} />
        </button>

        {done ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-5xl">🎁</div>
            <h3 className="text-lg font-black text-white">¡Bienvenido al {clubName}!</h3>
            {member?.member_code && (
              <div className="my-2 p-4 rounded-xl bg-black/40 border border-[#ff6b35]/30">
                <div className="text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-1">Tu código de miembro</div>
                <div className="text-3xl font-mono font-black tracking-[0.3em] text-[#ff6b35]">{member.member_code}</div>
                {member.is_vip && <div className="mt-1 text-[10px] font-black uppercase tracking-widest text-[#ff6b35]">⭐ Cliente VIP</div>}
                {member.discount_percent ? <div className="text-[11px] text-emerald-400 font-bold mt-0.5">{member.discount_percent}% de descuento</div> : null}
              </div>
            )}
            <p className="text-sm text-gray-400">
              Guarda tu código y muéstralo en tu próxima visita para reclamar tu beneficio de bienvenida.
            </p>
            <button onClick={onClose}
              className="w-full mt-2 py-3 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-wider transition-all">
              Cerrar
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#ff6b35]/15 flex items-center justify-center text-xl shrink-0">🎁</div>
              <div>
                <h3 className="text-base font-black text-white leading-tight">Únete al {clubName}</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{clubTagline}</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre *"
                className="w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600" />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com *"
                className="w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600" />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono (para ofertas por SMS)"
                className="w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600" />
              {errorMsg && (
                <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold text-center">{errorMsg}</div>
              )}
              <button type="submit" disabled={submitting || !name.trim() || !email.trim()}
                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-white bg-[#ff6b35] hover:bg-[#e85a25] disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-[#ff6b35]/15">
                {submitting ? 'Registrando...' : '🎁 ¡Quiero unirme!'}
              </button>
            </form>
            <p className="text-[10px] text-gray-600 text-center mt-3">Sin spam. Solo ofertas del restaurante.</p>
          </>
        )}
      </div>
    </div>
  );
};

// ─── Reserva de mesa: el cliente elige fecha, hora y nº de personas ──────────
const ReserveModal: React.FC<{
  restaurantId: string | null;
  isMobilePreview: boolean;
  settings: { maxPartySize?: number; openTime?: string; closeTime?: string; daysAhead?: number; autoConfirm?: boolean };
  restaurantName?: string;
  dishes?: any[];
  accent?: string;
  onClose: () => void;
}> = ({ restaurantId, isMobilePreview, settings, restaurantName, dishes = [], accent = '#ff6b35', onClose }) => {
  const maxParty = settings.maxPartySize ?? 12;
  const openTime = settings.openTime ?? '12:00';
  const closeTime = settings.closeTime ?? '22:00';
  const daysAhead = settings.daysAhead ?? 30;

  const today = new Date();
  const minDate = today.toISOString().slice(0, 10);
  const maxDate = new Date(today.getTime() + daysAhead * 86400000).toISOString().slice(0, 10);

  // Franjas horarias cada 30 min entre apertura y cierre.
  const slots = useMemo(() => {
    const out: string[] = [];
    const [oh, om] = openTime.split(':').map(Number);
    const [ch, cm] = closeTime.split(':').map(Number);
    let t = oh * 60 + om;
    const end = ch * 60 + cm;
    while (t <= end) {
      out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`);
      t += 30;
    }
    return out;
  }, [openTime, closeTime]);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [party, setParty] = useState(2);
  const [date, setDate] = useState(minDate);
  const [time, setTime] = useState(slots[0] || '19:00');
  const [notes, setNotes] = useState('');
  const [memberCode, setMemberCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code?: string; status?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // Pre-pedido opcional: cantidad por plato seleccionado.
  const [preorder, setPreorder] = useState<Record<string, number>>({});

  const setDishQty = (id: string, qty: number) =>
    setPreorder(prev => { const n = { ...prev }; if (qty <= 0) delete n[id]; else n[id] = qty; return n; });
  const preorderItems = useMemo(() =>
    dishes.filter((d: any) => preorder[String(d.id)] > 0).map((d: any) => ({
      id: d.id,
      name: d.cleanName || d.name,
      price: d.price,
      qty: preorder[String(d.id)],
      imageURL: d.imageURL,
    })), [dishes, preorder]);
  const preorderCount = preorderItems.reduce((s, i) => s + i.qty, 0);

  const inp = "w-full bg-black/40 border border-[#ff6b35]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#ff6b35] placeholder-gray-600";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !date || !time || submitting) return;
    if (isMobilePreview) { setResult({ code: 'DEMO5', status: settings.autoConfirm ? 'confirmada' : 'pendiente' }); return; }
    if (!restaurantId) { setErrorMsg('No se pudo identificar el restaurante. Recarga la página.'); return; }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('place_gastro_reservation', {
        p_restaurant_id: restaurantId,
        p_name: name.trim(),
        p_phone: phone.trim(),
        p_email: email.trim() || null,
        p_party_size: party,
        p_date: date,
        p_time: time,
        p_notes: notes.trim() || null,
        p_member_code: memberCode.trim() || null,
        p_items: preorderItems.length > 0 ? preorderItems : null,
      });
      if (error) throw error;
      if (!data?.ok) { setErrorMsg('No se pudo crear la reserva. Intenta de nuevo.'); setSubmitting(false); return; }
      setResult({ code: data.confirmation_code, status: data.status });
    } catch (err: any) {
      console.error('place_gastro_reservation error:', err);
      setErrorMsg(err?.message ? `No se pudo reservar: ${err.message}` : 'No se pudo reservar. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0f0702] rounded-2xl border border-[#ff6b35]/30 shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto"
           onClick={(e) => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition"><FaTimes size={16} /></button>

        {result ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-5xl">{result.status === 'confirmada' ? '✅' : '📅'}</div>
            <h3 className="text-lg font-black text-white">
              {result.status === 'confirmada' ? '¡Reserva confirmada!' : '¡Reserva recibida!'}
            </h3>
            {result.code && (
              <div className="my-2 p-4 rounded-xl bg-black/40 border border-[#ff6b35]/30">
                <div className="text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-1">Código de reserva</div>
                <div className="text-3xl font-mono font-black tracking-[0.3em] text-[#ff6b35]">{result.code}</div>
              </div>
            )}
            <p className="text-sm text-gray-400">
              {result.status === 'confirmada'
                ? `Te esperamos el ${new Date(date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long' })} a las ${time}.`
                : `${restaurantName || 'El restaurante'} revisará tu reserva y te confirmará por WhatsApp.`}
            </p>
            {preorderItems.length > 0 && (
              <div className="text-left p-3 rounded-xl bg-[#ff6b35]/10 border border-[#ff6b35]/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#ff6b35] mb-1.5">Tu pre-pedido</p>
                <div className="space-y-1">
                  {preorderItems.map((it) => (
                    <div key={it.id} className="flex justify-between text-xs text-[#ffefe5]/85">
                      <span>{it.qty}x {it.name}</span>
                      {it.price && <span className="font-mono text-[#ff6b35]">{it.price}</span>}
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5">El pago se realiza en el local.</p>
              </div>
            )}
            <button onClick={onClose} className="w-full mt-2 py-3 rounded-xl bg-[#ff6b35] hover:bg-[#e85a25] text-white font-black text-xs uppercase tracking-wider transition-all">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-11 h-11 rounded-xl bg-[#ff6b35]/15 flex items-center justify-center text-xl shrink-0">📅</div>
              <div>
                <h3 className="text-base font-black text-white leading-tight">Reservar una mesa</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">Elige fecha, hora y personas.</p>
              </div>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre *" className={inp} />
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp *" className={inp} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (opcional)" className={inp} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Fecha</label>
                  <input required type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} className={inp} />
                </div>
                <div>
                  <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Hora</label>
                  <select required value={time} onChange={(e) => setTime(e.target.value)} className={inp}>
                    {slots.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Personas</label>
                <div className="flex items-center gap-3 bg-black/40 border border-[#ff6b35]/20 rounded-xl px-4 py-2.5">
                  <button type="button" onClick={() => setParty(p => Math.max(1, p - 1))} className="w-8 h-8 rounded-lg bg-white/5 border border-[#ff6b35]/10 flex items-center justify-center text-sm font-black text-white">−</button>
                  <span className="font-mono font-bold text-white flex-1 text-center">{party}</span>
                  <button type="button" onClick={() => setParty(p => Math.min(maxParty, p + 1))} className="w-8 h-8 rounded-lg bg-white/5 border border-[#ff6b35]/10 flex items-center justify-center text-sm font-black text-white">+</button>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">Máximo {maxParty} personas por reserva.</p>
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (cumpleaños, alergias, ubicación preferida…)" rows={2} className={`${inp} resize-none`} />

              {/* Pre-pedido opcional: elegir platos disponibles para la reserva */}
              {dishes.length > 0 && (
                <div className="rounded-xl border border-[#ff6b35]/15 bg-black/20 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#ff6b35]/10">
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#ff6b35] flex items-center gap-1.5">
                      <FaUtensils size={11} /> Adelanta tu pedido (opcional)
                    </p>
                    {preorderCount > 0 && (
                      <span className="text-[10px] font-black text-white bg-[#ff6b35]/20 border border-[#ff6b35]/30 rounded-full px-2 py-0.5">{preorderCount}</span>
                    )}
                  </div>
                  <div className="max-h-44 overflow-y-auto divide-y divide-white/5">
                    {dishes.map((d: any) => {
                      const qty = preorder[String(d.id)] || 0;
                      return (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-2">
                          {d.imageURL
                            ? <img src={d.imageURL} alt="" className="w-9 h-9 rounded-lg object-cover border border-[#ff6b35]/10 shrink-0" />
                            : <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/5 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">{d.cleanName || d.name}</p>
                            {d.price && <p className="text-[10px] font-mono text-[#ff6b35]">{d.price}</p>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button type="button" onClick={() => setDishQty(String(d.id), qty - 1)} disabled={qty <= 0}
                              className="w-7 h-7 rounded-lg bg-white/5 border border-[#ff6b35]/10 flex items-center justify-center text-xs font-black text-white disabled:opacity-30">−</button>
                            <span className="font-mono font-bold text-white text-xs w-4 text-center">{qty}</span>
                            <button type="button" onClick={() => setDishQty(String(d.id), qty + 1)}
                              className="w-7 h-7 rounded-lg bg-white/5 border border-[#ff6b35]/10 flex items-center justify-center text-xs font-black text-white">+</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-500 px-3 py-2">Solo se muestran platos disponibles. El pago se realiza en el local.</p>
                </div>
              )}

              <input value={memberCode} onChange={(e) => setMemberCode(e.target.value)} placeholder="¿Eres miembro? Tu código (opcional)" className={`${inp} uppercase tracking-widest font-mono`} />
              {errorMsg && <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold text-center">{errorMsg}</div>}
              <button type="submit" disabled={submitting || !name.trim() || !phone.trim()}
                style={{ backgroundColor: accent }}
                className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-white hover:brightness-110 disabled:opacity-50 transition-all active:scale-95 shadow-lg shadow-[#ff6b35]/15 flex items-center justify-center gap-2">
                <FaCalendarAlt size={13} /> {submitting ? 'Reservando...' : (preorderCount > 0 ? `Reservar + ${preorderCount} plato(s)` : 'Confirmar reserva')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
