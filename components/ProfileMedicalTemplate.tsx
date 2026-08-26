import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MemberPlanBadge } from './MemberPlanCard';
import { supabase } from '../src/lib/supabase';
import { QRCodeCanvas } from 'qrcode.react';
import { ProfileExtraSections } from './ProfileExtraSections';
import FullCatalogView from './FullCatalogView';
import {
  FaClock, FaCheckCircle, FaQrcode, FaChevronRight, FaTimes, FaInbox,
  FaPhoneAlt, FaWhatsapp, FaEnvelope, FaShareAlt, FaMapMarkerAlt, FaStar,
  FaCalendarAlt, FaLink, FaGift, FaConciergeBell, FaMotorcycle, FaUserMd,
  FaSyringe, FaStethoscope, FaNotesMedical, FaShieldAlt, FaHeartbeat,
  FaShoppingBag, FaBookMedical, FaSearch
} from 'react-icons/fa';
import {
  useDebouncedValue, filterCatalog, countByCategory, applyCatalogLimit,
} from '../hooks/useCatalogSearch';

interface ProfileMedicalTemplateProps {
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
const ecWaNumber = (raw?: string): string => {
  let d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('593')) return d;
  if (d.startsWith('0')) d = '593' + d.slice(1);
  else if (d.length === 9) d = '593' + d;
  return d;
};
const ecWaLink = (raw: string | undefined, message: string) =>
  `https://wa.me/${ecWaNumber(raw)}?text=${encodeURIComponent(message)}`;

// Servicios clínicos por defecto (el dueño los puede sobreescribir con profile.clinicServices)
const DEFAULT_SERVICES = [
  'Consulta general', 'Medicina general', 'Chequeo preventivo',
  'Exámenes de laboratorio', 'Consulta de especialidad', 'Procedimiento menor',
];

export const ProfileMedicalTemplate: React.FC<ProfileMedicalTemplateProps> = ({
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
  const [orderType, setOrderType] = useState<'mesa' | 'delivery'>('mesa'); // 'mesa'=Retiro en clínica (valor interno intacto)
  const [mesaNumber, setMesaNumber] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [ordering, setOrdering] = useState<boolean>(false);
  const [successOrder, setSuccessOrder] = useState<any | null>(null);
  const [showFullMenu, setShowFullMenu] = useState<boolean>(false);
  const [fullMenuCat, setFullMenuCat] = useState<string>('');
  const [catalogQuery, setCatalogQuery] = useState<string>('');
  const [custName, setCustName] = useState<string>('');
  const [custPhone, setCustPhone] = useState<string>('');
  const [custAddress, setCustAddress] = useState<string>('');
  const [showClub, setShowClub] = useState<boolean>(false);
  const [trackCode, setTrackCode] = useState<string | null>(null);
  const [showTracker, setShowTracker] = useState<boolean>(false);
  const [invoiceCode, setInvoiceCode] = useState<string | null>(null);
  const [memberCode, setMemberCode] = useState<string>('');
  const [memberInfo, setMemberInfo] = useState<any | null>(null);
  const [checkingMember, setCheckingMember] = useState<boolean>(false);
  const [memberChecked, setMemberChecked] = useState<boolean>(false);
  const [showReserve, setShowReserve] = useState<boolean>(false);
  const [reserveService, setReserveService] = useState<string>('');
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const code = new URLSearchParams(window.location.search).get('pedido');
    if (code) { setTrackCode(code); setShowTracker(true); }
  }, []);

  // Group products by category dynamically (PetShop / Farmacia)
  const categorizedProducts = useMemo(() => {
    const map: Record<string, any[]> = {};
    const defaultCat = 'Catálogo';
    const products = profile?.products || [];
    products.forEach((p: any) => {
      let cat = defaultCat;
      let name = p.name || '';
      if (p.category && String(p.category).trim()) {
        cat = String(p.category).trim();
      } else if (name.includes('|')) {
        const parts = name.split('|');
        cat = parts[0].trim();
        name = parts.slice(1).join('|').trim();
      }
      if (!map[cat]) map[cat] = [];
      map[cat].push({ ...p, cleanName: name, category: cat });
    });
    return map;
  }, [profile?.products]);

  const plan = (profile?.plan ?? 'free').toLowerCase();

  const categoryNames = useMemo(() => Object.keys(categorizedProducts), [categorizedProducts]);
  // ULTRA: catálogo ilimitado. Planes inferiores: tope histórico de 25.
  const allProducts = useMemo(() => {
    const flat: any[] = [];
    categoryNames.forEach(cat => categorizedProducts[cat].forEach(p => flat.push(p)));
    return applyCatalogLimit(flat, plan);
  }, [categorizedProducts, categoryNames, plan]);

  // Buscador del catálogo completo (nombre, marca, principio activo, categoría).
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

  React.useEffect(() => {
    if (categoryNames.length > 0 && !selectedCat) setSelectedCat(categoryNames[0]);
    if (categoryNames.length > 0 && !fullMenuCat) setFullMenuCat(categoryNames[0]);
  }, [categoryNames, selectedCat, fullMenuCat]);

  const isProOrUltra = plan === 'pro' || plan === 'ultra';
  const isUltra = plan === 'ultra';
  const reservationsOn = isUltra && !!profile?.reservationsEnabled;
  const sectionOn = (k: string) => (profile as any)?.sectionVisibility?.[k] !== false;

  useEffect(() => {
    if (isMobilePreview || !sellerId) return;
    let active = true;
    const fetchAvailability = async () => {
      try {
        const { data, error } = await supabase.rpc('get_gastro_menu_availability', { p_restaurant_id: sellerId });
        if (error) throw error;
        if (active && data?.unavailable) setUnavailableIds(new Set(data.unavailable as string[]));
      } catch (e) { /* fail-open */ }
    };
    fetchAvailability();
    const id = setInterval(fetchAvailability, 30000);
    return () => { active = false; clearInterval(id); };
  }, [sellerId, isMobilePreview]);

  const isAgotado = (product: any) => product?.id != null && unavailableIds.has(String(product.id));
  const accent = (profile?.buttonColor && String(profile.buttonColor).trim()) || '#2563eb';
  const clubName = (profile?.clubName && String(profile.clubName).trim()) || 'Club de Pacientes';
  const clubTagline = (profile?.clubTagline && String(profile.clubTagline).trim()) || 'Acumula puntos en cada visita y desbloquea chequeos, descuentos y beneficios exclusivos de salud.';
  const services: string[] = Array.isArray(profile?.clinicServices) && profile.clinicServices.length > 0
    ? profile.clinicServices : DEFAULT_SERVICES;
  const emergencyPhone = profile?.emergencyPhone || profile?.phone || profile?.whatsapp || '';
  const specialty = profile?.specialty || profile?.jobTitle || '';
  const socialProof = profile?.socialProof || '';

  const availableDishes = useMemo(
    () => allProducts.filter((p: any) => !isAgotado(p)),
    [allProducts, unavailableIds]
  );

  // Ítems para la vista de catálogo a página completa ("Buscar en el catálogo").
  const catalogItems = useMemo(
    () => allProducts.map((p: any) => ({
      id: String(p.id),
      name: p.cleanName || p.name,
      price: p.price,
      image: p.imageURL,
      category: p.category,
      description: p.shortDescription || [p.brand, p.activeIngredient].filter(Boolean).join(' · '),
      disabled: isAgotado(p),
      raw: p,
    })),
    [allProducts, unavailableIds]
  );

  const openDish = (product: any) => {
    if (isAgotado(product)) return;
    setSuccessOrder(null);
    setActiveOrderModal(product);
    setQuantity(1); setMesaNumber(''); setOrderType('mesa');
    setCustName(''); setCustPhone(''); setCustAddress('');
    setMemberCode(''); setMemberInfo(null); setMemberChecked(false);
  };

  const openReserve = (service?: string) => { setReserveService(service || ''); setShowReserve(true); };

  const applyMemberCode = async () => {
    if (!memberCode.trim() || checkingMember) return;
    setCheckingMember(true); setMemberChecked(false);
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
    } catch (e) { console.error('get_gastro_member error:', e); setMemberInfo(null); }
    finally { setCheckingMember(false); setMemberChecked(true); }
  };

  const dishBase = activeOrderModal ? (parseFloat((activeOrderModal.price || '0').replace(/[^0-9.]/g, '')) || 0) * quantity : 0;
  const memberDiscount = memberInfo?.found ? (memberInfo.discount_percent || 0) : 0;
  const dishTotal = +(dishBase * (1 - memberDiscount / 100)).toFixed(2);

  const handlePlaceOrder = async () => {
    if (!activeOrderModal) return;
    if (isMobilePreview) { alert("Previsualización: el pedido se procesará en producción."); setActiveOrderModal(null); return; }
    if (!sellerId) { alert("No se pudo identificar la clínica. Recarga e intenta de nuevo."); return; }
    if (orderType === 'mesa' && !mesaNumber.trim()) { alert("Indica el nombre de quien retira en clínica."); return; }
    if (orderType === 'delivery' && (!custName.trim() || !custPhone.trim() || !custAddress.trim())) {
      alert("Para delivery necesitamos tu nombre, teléfono y dirección."); return;
    }
    setOrdering(true);
    const total = dishTotal;
    const items = [{ id: activeOrderModal.id, name: activeOrderModal.cleanName || activeOrderModal.name, price: activeOrderModal.price, qty: quantity, imageURL: activeOrderModal.imageURL }];
    const petNote = (() => {
      if (!memberInfo?.found || !memberInfo.name) return null;
      const n = String(memberInfo.name);
      if (n.includes('(') && n.includes(')')) return `🩺 ${n.slice(n.indexOf('(') + 1, n.lastIndexOf(')'))}`;
      return null;
    })();
    const vipNote = memberInfo?.found && memberDiscount > 0 ? `Miembro VIP ${memberInfo.member_code} (-${memberDiscount}%)` : null;
    const combinedNote = [petNote, vipNote].filter(Boolean).join(' · ') || null;
    try {
      const { data, error } = await supabase.rpc('place_gastro_order', {
        p_restaurant_id: sellerId,
        p_items: items,
        p_total_price: total,
        p_order_type: orderType,
        p_mesa_number: orderType === 'mesa' ? mesaNumber.trim() : null,
        p_customer_name: orderType === 'mesa' ? mesaNumber.trim() : (orderType === 'delivery' ? custName.trim() : null),
        p_customer_phone: orderType === 'delivery' ? custPhone.trim() : null,
        p_delivery_address: orderType === 'delivery' ? custAddress.trim() : null,
        p_notes: combinedNote,
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
    } finally { setOrdering(false); }
  };

  const hasSocialMedia = profile?.socialMedia && (
    profile.socialMedia.instagram || profile.socialMedia.facebook ||
    profile.socialMedia.tiktok || profile.socialMedia.twitter ||
    profile.socialMedia.youtube || profile.socialMedia.linkedin ||
    profile.socialMedia.website
  );
  const activeLinks = (links || []).filter((l: any) => l.isActive);

  const businessHours = Array.isArray(profile?.businessHours) ? profile.businessHours :
    profile?.openingHours ? (() => {
      const days = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
      const labels: Record<string,string> = { monday:'Lunes', tuesday:'Martes', wednesday:'Miércoles', thursday:'Jueves', friday:'Viernes', saturday:'Sábado', sunday:'Domingo' };
      return days.map(d => ({ day: labels[d], isOpen: profile.openingHours[d]?.isActive, openTime: profile.openingHours[d]?.start, closeTime: profile.openingHours[d]?.end })).filter((d: any) => d.isOpen);
    })() : [];

  const sectionTitle = (icon: React.ReactNode, txt: string, extra?: React.ReactNode) => (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-base font-black uppercase italic tracking-widest flex items-center gap-2" style={{ color: accent }}>
        {icon} {txt}
      </h2>
      {extra}
    </div>
  );

  return (
    <div className={`min-h-screen relative overflow-x-clip ${profileStyleLayer(profile).className}`}
         style={{
           ...profileStyleLayer(profile).style,
           backgroundColor: profile?.backgroundColor || '#020813',
           color: profile?.textColor || '#ffffff',
           fontFamily: profile?.fontFamily || "'Space Grotesk', -apple-system, sans-serif",
         }}>

      <div className="cinema-grain" aria-hidden="true" />

      {/* ══ SECCIÓN 1 · HERO: TRIAJE Y SUPERVIVENCIA ════════════════════════ */}
      {profile?.coverImageURL ? (
        <div className="w-full h-52 sm:h-72 overflow-hidden relative">
          <img src={profile.coverImageURL} alt="Portada" className="cinema-hero-cover w-full h-full object-cover" style={{ filter: 'brightness(0.6) saturate(1.1)' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-[#020813] via-[#020813]/20 to-black/30 pointer-events-none" />
        </div>
      ) : (
        <div className="w-full h-36 bg-gradient-to-br from-[#0a1b38] to-[#020813] border-b border-white/5" />
      )}

      <div className="relative flex flex-col items-center px-4 -mt-16 pb-4 cinema-animate-in">
        {/* El logo hace de respaldo: se subía y no se dibujaba en ninguna
            parte de esta plantilla. Si hay foto de perfil, la foto manda. */}
        {(profile?.profilePhotoURL || profile?.logoURL) && (
          <div className="relative">
            <div className="cinema-glow-ring absolute inset-0 rounded-3xl blur-xl" style={{ background: `radial-gradient(circle, ${accent}55, transparent 70%)`, transform: 'scale(1.4)' }} />
            <img src={profile.profilePhotoURL || profile.logoURL} alt={profile.displayName}
              className="w-28 h-28 rounded-3xl object-cover relative z-10"
              style={{ border: `2px solid ${accent}40`, boxShadow: '0 0 0 4px #020813, 0 20px 60px rgba(0,0,0,0.9)' }} />
          </div>
        )}

        <h1 className="mt-4 text-3xl font-bold tracking-tight text-center">{profile?.displayName}</h1>
        {specialty && (
          <p className="mt-1 text-xs font-black uppercase tracking-[0.2em]" style={{ color: accent }}>{specialty}</p>
        )}
        {socialProof && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-[#e8f1ff]/80">
            <FaShieldAlt size={10} style={{ color: accent }} /> {socialProof}
          </div>
        )}
        {profile?.bio && <p className="mt-3 text-center text-xs opacity-80 px-6 leading-relaxed max-w-md text-gray-300 italic">{profile.bio}</p>}

        {/* ── Botón de EMERGENCIA (SOS): fricción cero entre el pánico y recepción ── */}
        {emergencyPhone && (
          <a href={`tel:${emergencyPhone}`}
            className="mt-5 w-full max-w-md group relative overflow-hidden rounded-2xl p-[1.5px] bg-gradient-to-r from-[#ef4444] via-[#f97316] to-[#ef4444] active:scale-[0.99] transition-transform"
            style={{ boxShadow: '0 10px 40px rgba(239,68,68,0.35)' }}>
            <div className="relative rounded-2xl bg-[#1a0606] px-5 py-3.5 flex items-center gap-3">
              <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[#ef4444]/20 text-[#ff6b6b] shrink-0">
                <span className="absolute inline-flex h-full w-full rounded-xl bg-[#ef4444]/40 animate-ping" />
                <FaHeartbeat size={20} className="relative" />
              </span>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-black text-white leading-tight uppercase tracking-wider">Emergencia 24/7</p>
                <p className="text-[11px] text-[#ffd5d5]/80 leading-snug">Llamada directa a la línea de guardia. Toca aquí.</p>
              </div>
              <FaPhoneAlt size={16} className="text-[#ff6b6b] shrink-0 group-hover:scale-110 transition-transform" />
            </div>
          </a>
        )}

        {/* Contacto */}
        <div className="flex flex-wrap justify-center gap-2.5 mt-5">
          {profile?.phone && (
            <a href={`tel:${profile.phone}`} title="Llamar"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:border-[#2563eb]/40 text-[#e8f1ff]/70 hover:text-white transition-all hover:scale-105"><FaPhoneAlt size={14} /></a>
          )}
          {profile?.whatsapp && (
            <a href={`https://wa.me/${ecWaNumber(profile.whatsapp)}`} target="_blank" rel="noopener noreferrer" title="WhatsApp"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:border-[#25D366]/40 text-[#e8f1ff]/70 hover:text-[#25D366] transition-all hover:scale-105"><FaWhatsapp size={16} /></a>
          )}
          {profile?.contactEmail && (
            <a href={`mailto:${profile.contactEmail}`} title="Email"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:border-[#2563eb]/40 text-[#e8f1ff]/70 hover:text-white transition-all hover:scale-105"><FaEnvelope size={14} /></a>
          )}
          {setShowQRModal && (
            <button onClick={() => setShowQRModal(true)} title="Ver QR"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:border-[#2563eb]/40 text-[#e8f1ff]/70 hover:text-white transition-all hover:scale-105"><FaQrcode size={14} /></button>
          )}
          {downloadVCard && (
            <button onClick={downloadVCard} disabled={isVCardLoading} title="Guardar Contacto"
              className="w-11 h-11 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:border-[#2563eb]/40 text-[#e8f1ff]/70 hover:text-white transition-all hover:scale-105 disabled:opacity-50">📥</button>
          )}
        </div>
      </div>

      {/* Redes sociales */}
      {sectionOn('social') && hasSocialMedia && (
        <div className="flex justify-center flex-wrap gap-2 mt-4 px-4">
          {profile.socialMedia.instagram && (
            <a href={`https://instagram.com/${profile.socialMedia.instagram.replace('@','')}`} target="_blank" rel="noopener noreferrer" title="Instagram"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#2563eb]/30 text-[#e8f1ff]/60 hover:text-white transition">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
            </a>
          )}
          {profile.socialMedia.facebook && (
            <a href={profile.socialMedia.facebook.startsWith('http') ? profile.socialMedia.facebook : `https://facebook.com/${profile.socialMedia.facebook}`} target="_blank" rel="noopener noreferrer" title="Facebook"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#2563eb]/30 text-[#e8f1ff]/60 hover:text-white transition">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </a>
          )}
          {profile.socialMedia.tiktok && (
            <a href={`https://tiktok.com/@${profile.socialMedia.tiktok.replace('@','')}`} target="_blank" rel="noopener noreferrer" title="TikTok"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#2563eb]/30 text-[#e8f1ff]/60 hover:text-white transition">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/></svg>
            </a>
          )}
          {profile.socialMedia.website && (
            <a href={profile.socialMedia.website} target="_blank" rel="noopener noreferrer" title="Sitio Web"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#2563eb]/30 text-[#e8f1ff]/60 hover:text-white transition">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
            </a>
          )}
        </div>
      )}

      {/* Compartir — debajo de redes sociales */}
      {handleShare && (
        <div className="flex justify-center mt-3 px-4">
          <button onClick={handleShare} style={{ backgroundColor: accent }}
            className="flex items-center gap-2 px-5 h-10 text-white rounded-xl transition-all font-bold text-xs uppercase tracking-wider hover:brightness-110 hover:scale-105">
            <FaShareAlt size={12} /><span>Compartir perfil</span>
          </button>
        </div>
      )}

      {(profile?.location || (Array.isArray(profile?.locations) && profile.locations.length > 0)) && (
        <div className="flex flex-col items-center gap-1.5 px-4 mt-4 mb-1">
          {(Array.isArray(profile?.locations) && profile.locations.length > 0 ? profile.locations : [profile.location]).map((loc: string, i: number) => (
            <a key={i} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-[#e8f1ff]/60 hover:text-[#2563eb] transition-colors">
              <FaMapMarkerAlt className="shrink-0" style={{ color: accent }} size={11} /><span>{loc}</span>
            </a>
          ))}
        </div>
      )}

      {/* Agendar cita — solo el botón */}
      {reservationsOn && (
        <div className="px-4 max-w-md mx-auto mt-5">
          <button onClick={() => openReserve('')} style={{ backgroundColor: accent }}
            className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white shadow-lg transition-all hover:brightness-110 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2">
            <FaCalendarAlt size={13} /> Agendar una cita
          </button>
        </div>
      )}

      {/* Rastrear cita / pedido */}
      <div className="px-4 max-w-md mx-auto mt-3">
        <button onClick={() => { setTrackCode(null); setShowTracker(true); }}
          className="w-full py-3 rounded-xl bg-white/5 border border-white/10 hover:border-[#2563eb]/40 text-[#e8f1ff]/80 hover:text-white text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2">
          <FaClock size={12} /> Rastrear mi cita o pedido
        </button>
      </div>

      {isProOrUltra && profile?.bookingLink && (
        <div className="px-4 max-w-md mx-auto mt-3">
          <a href={profile.bookingLink} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: accent }}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider text-white hover:brightness-110 transition-all hover:scale-[1.02] active:scale-95"><FaCalendarAlt size={14} /> Más opciones de agenda</a>
        </div>
      )}

      {sectionOn('links') && isProOrUltra && activeLinks.length > 0 && (
        <div className="px-4 max-w-md mx-auto mt-4 space-y-2">
          {activeLinks.map((link: any) => (
            <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" onClick={() => onLinkClick?.(link.id)}
              className="flex items-center justify-center gap-2 w-full py-3 px-5 bg-white/5 border border-white/10 hover:border-[#2563eb]/30 rounded-xl text-xs font-bold uppercase tracking-wider text-[#e8f1ff] hover:text-[#2563eb] transition-all hover:scale-[1.01]"><FaLink size={10} />{link.title}</a>
          ))}
        </div>
      )}

      {/* ══ SECCIÓN 3 · CLUB PET VIP Y EXPEDIENTE DE SALUD ════════════════════ */}
      <div className="px-4 max-w-md mx-auto mt-8">
        {sectionTitle(<FaUserMd size={13} />, clubName)}
        <button onClick={() => setShowClub(true)}
          className="group relative w-full overflow-hidden rounded-2xl p-[1px] bg-gradient-to-r from-[#2563eb] via-[#60a5fa] to-[#2563eb] active:scale-[0.99] transition-transform">
          <div className="relative rounded-2xl bg-[#0b1b33] px-5 py-4 flex items-center gap-4 text-left">
            <div className="w-11 h-11 rounded-xl bg-[#2563eb]/15 flex items-center justify-center text-xl shrink-0">🩺</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-white leading-tight">Afíliate al {clubName}</p>
              <p className="text-[11px] text-[#e8f1ff]/60 mt-0.5 leading-snug">{clubTagline}</p>
            </div>
            <FaGift className="text-lg shrink-0 group-hover:scale-110 transition-transform" style={{ color: accent }} />
          </div>
        </button>
        <div className="mt-3">
          <MembershipLookup restaurantId={sellerId} isMobilePreview={isMobilePreview} clubName={clubName} accent={accent}
            stampsReward={profile?.stampsReward} allowDownload={!!profile?.allowRecordDownload} clinicName={profile?.displayName}
            onJoinClick={() => setShowClub(true)} />
        </div>
      </div>

      {/* ══ SECCIÓN 4 · PETSHOP Y FARMACIA DIGITAL (venta por impulso) ══════ */}
      <div className="px-4 max-w-md mx-auto mt-8 cinema-animate-in-delay-2">
        {sectionTitle(<FaShoppingBag size={13} />, 'Farmacia y Productos',
          allProducts.length > 0 ? <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">{allProducts.length} productos</span> : undefined)}

        {allProducts.length > 0 ? (
          <>
            {categoryNames.length > 1 && (
              <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-3">
                {categoryNames.map((cat) => (
                  <button key={cat} onClick={() => setSelectedCat(cat)}
                    style={selectedCat === cat ? { backgroundColor: accent, borderColor: 'transparent' } : undefined}
                    className={`px-4 py-2 rounded-full text-[11px] font-black uppercase tracking-wider shrink-0 border transition-all ${selectedCat === cat ? 'text-white shadow-lg' : 'bg-[#2563eb]/5 border-[#2563eb]/10 text-gray-400 hover:text-white hover:border-[#2563eb]/25'}`}>{cat}</button>
                ))}
              </div>
            )}
            <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-4 px-4 scroll-px-4">
              {(categorizedProducts[selectedCat] || []).slice(0, 12).map((product) => {
                const agotado = isAgotado(product);
                return (
                  <div key={product.id} onClick={() => openDish(product)}
                    className={`snap-start shrink-0 w-40 rounded-2xl overflow-hidden border bg-white/[0.03] transition-all duration-300 ${agotado ? 'opacity-60 cursor-not-allowed border-white/5' : 'cursor-pointer border-[#2563eb]/10 hover:border-[#2563eb]/30 hover:-translate-y-0.5'}`}>
                    <div className="relative">
                      {product.imageURL ? (
                        <img src={product.imageURL} alt={product.name} className={`w-full h-28 object-cover ${agotado ? 'grayscale' : ''}`} />
                      ) : (
                        <div className="w-full h-28 bg-gradient-to-br from-[#0a1b38] to-[#07132b] flex items-center justify-center text-[#2563eb]/25"><FaShoppingBag size={22} /></div>
                      )}
                      {agotado && <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-white bg-black/55">Agotado</span>}
                    </div>
                    <div className="p-3">
                      <h4 className="cnx-product-text font-bold text-xs text-[#e8f1ff] truncate leading-snug">{product.cleanName}</h4>
                      {product.shortDescription && <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2 leading-snug">{product.shortDescription}</p>}
                      <div className="flex items-center justify-between mt-2">
                        {product.price ? <span className="font-mono text-xs font-black" style={{ color: accent }}>{product.price}</span> : <span />}
                        {!agotado && <span className="text-[9px] font-black uppercase tracking-wider" style={{ color: accent }}>Comprar →</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5 text-center tracking-wide">👈 Desliza para ver más productos 👉</p>
            <button onClick={() => { setCatalogQuery(''); setShowFullMenu(true); }} style={{ backgroundColor: accent }}
              className="mt-4 w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white shadow-lg transition-all hover:brightness-110 hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-2"><FaSearch size={12} /> Buscar en el catálogo ({allProducts.length})</button>
          </>
        ) : (
          <div className="text-center py-10 text-gray-500"><FaInbox className="mx-auto text-3xl mb-2" /><p className="text-xs">El catálogo estará disponible pronto.</p></div>
        )}
      </div>

      {/* "Mostrar horarios" se ignoraba: apagarlo no ocultaba nada. Se respeta
          sólo cuando está explícitamente en false, para no cambiarle el perfil
          a quien nunca tocó el ajuste. */}
      {profile?.showSchedule !== false && businessHours.length > 0 && (
        <div className="px-4 max-w-md mx-auto mt-8">
          <div className="bg-white/[0.03] border border-[#2563eb]/10 rounded-2xl p-5">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-4" style={{ color: accent }}><FaClock size={11} /> Horarios de Atención</h3>
            <div className="space-y-2">
              {businessHours.map((day: any, i: number) => (
                <div key={i} className="flex justify-between items-center text-xs py-1 border-b border-white/5 last:border-b-0">
                  <span className="text-[#e8f1ff]/80 font-semibold capitalize">{day.day}</span>
                  <span className="font-bold font-mono" style={{ color: accent }}>{day.isOpen && day.openTime && day.closeTime ? `${day.openTime} – ${day.closeTime}` : 'Cerrado'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Reseñas */}
      {sectionOn('testimonials') && isProOrUltra && Array.isArray(profile?.testimonials) && profile.testimonials.length > 0 && (
        <div className="px-4 max-w-md mx-auto mt-8">
          {sectionTitle(<FaStar size={12} />, 'Pacientes que confían en nosotros')}
          <div className="space-y-3.5">
            {profile.testimonials.map((test: any) => (
              <div key={test.id} className="relative overflow-hidden rounded-2xl p-[1px] bg-gradient-to-br from-[#2563eb]/30 via-[#2563eb]/5 to-transparent">
                <div className="relative rounded-2xl bg-gradient-to-br from-[#0a1a38] to-[#07132b] p-5">
                  <span className="absolute top-2 right-4 text-5xl leading-none font-serif text-[#2563eb]/15 select-none pointer-events-none">”</span>
                  <div className="flex items-center gap-0.5 mb-2.5" style={{ color: accent }}>{Array.from({ length: 5 }).map((_, i) => <FaStar key={i} size={11} />)}</div>
                  <p className="cnx-testimonial-text italic text-[13px] text-[#e8f1ff]/90 leading-relaxed relative z-10">"{test.quote}"</p>
                  <div className="flex items-center gap-3 mt-4 pt-3.5 border-t border-[#2563eb]/10">
                    {test.authorImageURL ? (
                      <img src={test.authorImageURL} alt={test.author} className="w-9 h-9 rounded-full object-cover border-2 border-[#2563eb]/40" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-[#2563eb]/15 border border-[#2563eb]/30 flex items-center justify-center font-black text-sm shrink-0" style={{ color: accent }}>{String(test.author || '?').charAt(0).toUpperCase()}</div>
                    )}
                    <div className="min-w-0"><p className="font-black text-xs text-white truncate">{test.author}</p>{test.authorTitle && <p className="text-[10px] text-[#e8f1ff]/40 truncate">{test.authorTitle}</p>}</div>
                    <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 shrink-0">✓ Verificada</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ SECCIÓN 5 · CENTRO DE PROPIETARIOS (educación y FAQs) ═══════════ */}
      {((Array.isArray(profile?.digitalFiles) && profile.digitalFiles.length > 0) || (Array.isArray(profile?.faqs) && profile.faqs.length > 0)) && (
        <div className="px-4 max-w-md mx-auto mt-8">
          {sectionTitle(<FaBookMedical size={13} />, 'Centro del Paciente')}
          <p className="text-[11px] text-gray-500 mb-3 leading-snug">Guías de salud y respuestas rápidas para que te cuides sin esperas.</p>
        </div>
      )}
      <ProfileExtraSections profile={profile} accent={accent} isMobilePreview={isMobilePreview} />

      <div className="text-center py-6 opacity-30 text-xs tracking-wider"><p>Powered by Connexo © 2026</p></div>

      {/* ── Botón SOS flotante (fricción cero) ── */}
      {emergencyPhone && !isMobilePreview && (
        <a href={`tel:${emergencyPhone}`} title="Emergencia 24/7"
          className="fixed bottom-5 right-5 z-[90] flex items-center gap-2 px-4 py-3 rounded-full text-white font-black text-xs uppercase tracking-wider shadow-2xl active:scale-95 transition-transform"
          style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)', boxShadow: '0 10px 35px rgba(239,68,68,0.5)' }}>
          <span className="relative flex h-4 w-4"><span className="absolute inline-flex h-full w-full rounded-full bg-white/60 animate-ping" /><FaHeartbeat size={16} className="relative" /></span>
          SOS
        </a>
      )}

      {/* ─── PRODUCTO / CHECKOUT RÁPIDO ─── */}
      {activeOrderModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={() => setActiveOrderModal(null)}>
          <div className="bg-[#0b1b33] border border-[#2563eb]/25 w-full max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl relative max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden text-white" onClick={(e) => e.stopPropagation()}>
            <div className="relative shrink-0">
              <button onClick={() => setActiveOrderModal(null)} className="absolute top-4 right-4 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2.5 transition-colors border border-white/10"><FaTimes size={14} /></button>
              {activeOrderModal.imageURL && <img src={activeOrderModal.imageURL} alt={activeOrderModal.cleanName} className="w-full h-48 sm:h-56 object-cover border-b border-[#2563eb]/15" />}
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              <h2 className="text-xl font-bold tracking-tight">{activeOrderModal.cleanName}</h2>
              {activeOrderModal.price && <p className="text-lg font-mono font-black mt-1" style={{ color: accent }}>{activeOrderModal.price}</p>}
              <p className="text-xs text-gray-300 mt-3 leading-relaxed whitespace-pre-wrap">{activeOrderModal.longDescription || activeOrderModal.shortDescription || "Sin descripción disponible."}</p>
              {activeOrderModal.allergens && String(activeOrderModal.allergens).trim() && (
                <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20">
                  <FaNotesMedical className="text-amber-400 shrink-0 mt-0.5" size={13} />
                  <div><p className="text-[10px] font-black uppercase tracking-widest text-amber-400">Indicaciones</p><p className="text-xs text-amber-200/80 mt-0.5 leading-snug">{activeOrderModal.allergens}</p></div>
                </div>
              )}
              <div className="mt-6 pt-5 border-t border-[#2563eb]/15 space-y-4">
                <h4 className="text-xs font-black uppercase tracking-widest" style={{ color: accent }}>¿Cómo lo quieres?</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setOrderType('mesa')}
                    className={`py-3 px-3 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-1.5 ${orderType === 'mesa' ? 'bg-[#2563eb]/15 border-[#2563eb]/40 text-[#e8f1ff]' : 'bg-black/30 border-white/5 text-gray-400'}`}><FaConciergeBell size={16} /> Retiro en Clínica</button>
                  <button type="button" onClick={() => setOrderType('delivery')}
                    className={`py-3 px-3 rounded-xl text-xs font-bold transition-all border flex flex-col items-center gap-1.5 ${orderType === 'delivery' ? 'bg-[#2563eb]/15 border-[#2563eb]/40 text-[#e8f1ff]' : 'bg-black/30 border-white/5 text-gray-400'}`}><FaMotorcycle size={16} /> Delivery Local</button>
                </div>
                {orderType === 'mesa' ? (
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-wider text-gray-400 mb-2">Nombre de quien retira</label>
                    <input type="text" value={mesaNumber} onChange={(e) => setMesaNumber(e.target.value)} placeholder="Ej: Ana Pérez"
                      className="w-full p-3 rounded-xl bg-black/40 border border-[#2563eb]/20 text-[#e8f1ff] placeholder-gray-600 focus:outline-none focus:border-[#2563eb] text-sm" />
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <input type="text" value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Tu nombre *" className="w-full p-3 rounded-xl bg-black/40 border border-[#2563eb]/20 text-[#e8f1ff] placeholder-gray-600 focus:outline-none focus:border-[#2563eb] text-sm" />
                    <input type="tel" value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Teléfono / WhatsApp *" className="w-full p-3 rounded-xl bg-black/40 border border-[#2563eb]/20 text-[#e8f1ff] placeholder-gray-600 focus:outline-none focus:border-[#2563eb] text-sm" />
                    <textarea value={custAddress} onChange={(e) => setCustAddress(e.target.value)} placeholder="Dirección de entrega *" rows={2} className="w-full p-3 rounded-xl bg-black/40 border border-[#2563eb]/20 text-[#e8f1ff] placeholder-gray-600 focus:outline-none focus:border-[#2563eb] text-sm resize-none" />
                  </div>
                )}
                <div className="flex items-center justify-between bg-black/20 p-3 rounded-xl border border-[#2563eb]/10">
                  <span className="text-xs text-gray-400 font-bold uppercase tracking-wider">Cantidad</span>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg bg-white/5 border border-[#2563eb]/10 flex items-center justify-center text-sm font-black active:bg-white/10">-</button>
                    <span className="font-mono font-bold text-sm w-4 text-center">{quantity}</span>
                    <button type="button" onClick={() => setQuantity(q => q + 1)} className="w-8 h-8 rounded-lg bg-white/5 border border-[#2563eb]/10 flex items-center justify-center text-sm font-black active:bg-white/10">+</button>
                  </div>
                </div>
                <div className="pt-4 border-t border-[#2563eb]/15">
                  <label className="text-[10px] font-black uppercase tracking-wider mb-2 flex items-center gap-1.5" style={{ color: accent }}><FaStar size={10} /> ¿Eres miembro VIP? Aplica tu código</label>
                  <div className="flex gap-2">
                    <input type="text" value={memberCode} onChange={(e) => { setMemberCode(e.target.value); setMemberChecked(false); setMemberInfo(null); }} placeholder="Tu código de miembro"
                      className="flex-1 p-3 rounded-xl bg-black/40 border border-[#2563eb]/20 text-[#e8f1ff] placeholder-gray-600 focus:outline-none focus:border-[#2563eb] text-sm uppercase tracking-widest font-mono" />
                    <button type="button" onClick={applyMemberCode} disabled={!memberCode.trim() || checkingMember} className="px-4 rounded-xl bg-[#2563eb]/15 border border-[#2563eb]/30 text-xs font-black uppercase tracking-wider hover:bg-[#2563eb]/25 disabled:opacity-40 transition" style={{ color: accent }}>{checkingMember ? '...' : 'Aplicar'}</button>
                  </div>
                  {memberChecked && memberInfo?.found && (
                    <div className="mt-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-bold flex items-center gap-2">✅ {memberInfo.is_vip ? 'VIP' : 'Miembro'} {memberInfo.name ? `· ${memberInfo.name}` : ''}{memberDiscount > 0 ? ` · ${memberDiscount}% de descuento` : ' · sin descuento activo'}</div>
                  )}
                  {memberChecked && !memberInfo?.found && (
                    <div className="mt-2 p-2.5 rounded-lg bg-white/5 border border-[#2563eb]/15 text-xs text-gray-300 flex items-center justify-between gap-2"><span>No encontramos ese código.</span><button type="button" onClick={() => { setActiveOrderModal(null); setShowClub(true); }} className="font-black uppercase tracking-wider text-[10px] shrink-0" style={{ color: accent }}>Afíliate →</button></div>
                  )}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-[#2563eb]/15 shrink-0 bg-black/30">
              {memberDiscount > 0 && (
                <div className="flex items-center justify-between mb-2 text-xs"><span className="text-gray-400 line-through">${dishBase.toFixed(2)}</span><span className="text-emerald-400 font-bold">-{memberDiscount}% VIP</span><span className="text-white font-black">${dishTotal.toFixed(2)}</span></div>
              )}
              <button type="button" onClick={handlePlaceOrder} disabled={ordering} style={{ backgroundColor: accent }}
                className="w-full py-4 text-center font-black text-xs uppercase tracking-widest text-white rounded-xl shadow-lg transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2">
                {ordering ? 'Procesando...' : <><FaShoppingBag size={13} /> {orderType === 'mesa' ? 'Reservar para retiro' : 'Pedir a domicilio'} · ${dishTotal.toFixed(2)}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── ÉXITO DEL PEDIDO ─── */}
      {successOrder && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm" onClick={() => setSuccessOrder(null)}>
          <div className="bg-[#0b1b33] border-2 border-green-500/30 w-full max-w-md rounded-2xl shadow-2xl relative p-6 flex flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 rounded-full bg-green-500/10 flex items-center justify-center text-green-400 mb-4 border border-green-500/20"><FaCheckCircle size={28} /></div>
            <h3 className="text-xl font-bold text-white">¡Pedido Registrado!</h3>
            <p className="text-xs text-gray-400 mt-2 leading-relaxed px-4">Tu pedido fue enviado a la clínica. Muestra esta pantalla en recepción para validarlo.</p>
            <div className="my-6 p-4 rounded-xl bg-black/40 border border-[#2563eb]/20 w-full">
              <div className="text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-1">Código de Validación</div>
              <div className="text-3xl font-mono font-black tracking-widest" style={{ color: accent }}>{successOrder.verification_code}</div>
              <div className="text-xs text-gray-400 mt-1 font-bold">{successOrder.order_type === 'mesa' ? 'Retiro en clínica' : `Delivery${successOrder.customer_name ? ` · ${successOrder.customer_name}` : ''}`}</div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl my-2 border border-white/10">
              <QRCodeCanvas value={`${(typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '')}?pedido=${successOrder.verification_code}`} size={160} level="M" includeMargin={true} bgColor="#ffffff" />
            </div>
            <div className="mt-4 w-full p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-left">
              <p className="text-[11px] text-amber-200/90 font-bold leading-snug">💵 Total a pagar: <span className="text-white">${Number(successOrder.total_price ?? 0).toFixed(2)} USD</span></p>
              <p className="text-[10px] text-amber-200/60 mt-1 leading-snug">Sube tu comprobante por WhatsApp para que la clínica prepare tu pedido:</p>
            </div>
            {profile?.paymentLink && (
              <a href={profile.paymentLink} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: accent }} className="mt-3 w-full py-3.5 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:brightness-110 flex items-center justify-center gap-2">💳 Pagar en línea</a>
            )}
            <button type="button" onClick={async () => {
              const code = successOrder.verification_code;
              const waPhone = profile?.whatsapp ?? profile?.phone ?? '';
              window.open(ecWaLink(waPhone, `¡Hola ${profile?.displayName || ''}! Adjunto el comprobante de pago de mi pedido #${code} por $${Number(successOrder.total_price ?? 0).toFixed(2)} USD.`), '_blank');
              if (!isMobilePreview && sellerId) { try { await supabase.rpc('notify_gastro_payment', { p_restaurant_id: sellerId, p_code: code }); } catch (e) { console.error(e); } }
            }} className="mt-2 w-full py-3.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"><FaWhatsapp size={14} /> {profile?.paymentLink ? 'O envía tu comprobante' : 'Pagar · Enviar comprobante'}</button>
            <button type="button" onClick={() => setInvoiceCode(successOrder.verification_code)} className="mt-2 w-full py-3 bg-white/5 hover:bg-white/10 border border-[#2563eb]/20 text-[#e8f1ff] rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2">🧾 ¿Necesitas factura?</button>
            <button type="button" onClick={() => { const c = successOrder.verification_code; setSuccessOrder(null); setTrackCode(c); setShowTracker(true); }} style={{ backgroundColor: accent }} className="mt-2 w-full py-3.5 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all hover:brightness-110 flex items-center justify-center gap-2"><FaClock size={12} /> Ver estado en vivo</button>
            <button type="button" onClick={() => setSuccessOrder(null)} className="mt-2 w-full py-3 bg-white/5 hover:bg-white/10 border border-[#2563eb]/20 text-[#e8f1ff] rounded-xl text-xs font-black uppercase tracking-wider transition-all">Cerrar</button>
          </div>
        </div>
      )}

      {/* ─── CATÁLOGO COMPLETO ─── */}
      {showFullMenu && (
        <FullCatalogView
          items={catalogItems}
          onBack={() => setShowFullMenu(false)}
          onSelect={(raw) => { setShowFullMenu(false); openDish(raw); }}
          accent={accent}
          bg="#07132b"
          text="#e8f1ff"
          fontFamily={profile?.fontFamily}
          title="Farmacia y Productos"
          searchPlaceholder="Buscar (ej. Amoxicilina, Ibuprofeno, marca)"
          emptyLabel="El catálogo estará disponible pronto."
          ctaLabel="Ver →"
          isMobilePreview={isMobilePreview}
        />
      )}

      {showClub && (<ClubPetModal restaurantId={sellerId} isMobilePreview={isMobilePreview} clubName={clubName} clubTagline={clubTagline} accent={accent} onClose={() => setShowClub(false)} />)}
      {showReserve && (<ReserveModal restaurantId={sellerId} isMobilePreview={isMobilePreview} settings={profile?.reservationSettings || {}} restaurantName={profile?.displayName} services={services} initialService={reserveService} dishes={availableDishes} accent={accent} payLink={profile?.paymentLink} waPhone={profile?.whatsapp ?? profile?.phone ?? ''} onClose={() => setShowReserve(false)} />)}
      {showTracker && (<OrderTracker restaurantId={sellerId} initialCode={trackCode} isMobilePreview={isMobilePreview} accent={accent} waPhone={profile?.whatsapp ?? profile?.phone ?? ''} restaurantName={profile?.displayName} payLink={profile?.paymentLink} onInvoice={(c) => setInvoiceCode(c)} onClose={() => { setShowTracker(false); setTrackCode(null); }} />)}
      {invoiceCode && (<InvoiceModal restaurantId={sellerId} code={invoiceCode} isMobilePreview={isMobilePreview} accent={accent} onClose={() => setInvoiceCode(null)} />)}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════
// Rastreador de pedido / cita en vivo
// ════════════════════════════════════════════════════════════════════════
const ORDER_META: Record<string, { label: string; emoji: string }> = {
  pendiente: { label: 'Recibido', emoji: '📝' }, preparando: { label: 'Preparando', emoji: '💊' },
  listo: { label: 'Listo', emoji: '🔔' }, en_camino: { label: 'En camino', emoji: '🛵' },
  entregado: { label: 'Entregado', emoji: '✅' }, completado: { label: 'Entregado', emoji: '✅' },
  cancelado: { label: 'Cancelado', emoji: '❌' },
};
const RES_META: Record<string, { label: string; emoji: string; cls: string }> = {
  pendiente: { label: 'Pendiente de confirmación', emoji: '⏳', cls: 'bg-amber-500/10 border-amber-500/25 text-amber-200/90' },
  confirmada: { label: 'Cita confirmada', emoji: '✅', cls: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' },
  sentada: { label: '¡En consulta!', emoji: '🩺', cls: 'bg-blue-500/10 border-blue-500/25 text-blue-300' },
  cancelada: { label: 'Cita cancelada', emoji: '❌', cls: 'bg-red-500/10 border-red-500/25 text-red-300' },
  no_show: { label: 'Cita no asistida', emoji: '🚫', cls: 'bg-white/5 border-white/10 text-gray-300' },
};

const OrderTracker: React.FC<{
  restaurantId: string | null; initialCode: string | null; isMobilePreview: boolean; accent: string;
  waPhone?: string; restaurantName?: string; payLink?: string; onInvoice?: (code: string) => void; onClose: () => void;
}> = ({ restaurantId, initialCode, isMobilePreview, accent, waPhone, restaurantName, payLink, onInvoice, onClose }) => {
  const [code, setCode] = useState(initialCode || '');
  const [tracking, setTracking] = useState(!!initialCode);
  const [data, setData] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const fetchStatus = useCallback(async (c: string) => {
    if (isMobilePreview) { setData({ kind: 'order', found: true, status: 'preparando', order_type: 'mesa', estimated_minutes: 15, code: c }); return; }
    if (!restaurantId || !c) return;
    try {
      const { data: d } = await supabase.rpc('get_order_status', { p_restaurant_id: restaurantId, p_code: c.trim() });
      if (d && d.found) { setData({ ...d, kind: 'order' }); setNotFound(false); return; }
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

  const steps = (data?.order_type === 'delivery') ? ['pendiente', 'preparando', 'listo', 'en_camino', 'entregado'] : ['pendiente', 'preparando', 'listo', 'entregado'];
  const currentIdx = data ? steps.indexOf(data.status === 'completado' ? 'entregado' : data.status) : -1;
  const cancelled = data?.status === 'cancelado';

  return (
    <div className="fixed inset-0 z-[118] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b1b33] rounded-2xl border border-[#2563eb]/30 shadow-2xl p-6 relative" onClick={(e) => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition"><FaTimes size={16} /></button>
        <h3 className="text-base font-black text-white flex items-center gap-2 mb-4"><FaClock style={{ color: accent }} /> Estado de tu pedido o cita</h3>
        {!tracking ? (
          <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) setTracking(true); }} className="space-y-3">
            <p className="text-xs text-gray-400">Ingresa el código de tu pedido o de tu cita.</p>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Código (ej. A3F9C)" className="w-full bg-black/40 border border-[#2563eb]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#2563eb] placeholder-gray-600 uppercase tracking-widest font-mono" />
            <button type="submit" disabled={!code.trim()} style={{ backgroundColor: accent }} className="w-full py-3 rounded-xl text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all hover:brightness-110">Ver estado</button>
          </form>
        ) : notFound ? (
          <div className="text-center py-4 space-y-3"><div className="text-4xl">🔍</div><p className="text-sm text-gray-400">No encontramos un pedido ni una cita con ese código.</p><button onClick={() => { setTracking(false); setNotFound(false); }} className="text-[11px] font-black uppercase tracking-wider" style={{ color: accent }}>Intentar con otro código</button></div>
        ) : !data ? (
          <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2" style={{ borderColor: accent }} /></div>
        ) : data.kind === 'reservation' ? (
          (() => {
            const rm = RES_META[data.status] || RES_META.pendiente;
            const dateLabel = data.reservation_date ? new Date(data.reservation_date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long' }) : '';
            return (
              <div className="space-y-4">
                <div className="text-center"><div className="text-4xl">{rm.emoji}</div><p className="text-lg font-black text-white mt-1">{rm.label}</p><p className="text-[10px] text-gray-500 mt-1 font-mono tracking-widest">Cita · Código {data.code}</p></div>
                <div className="rounded-xl bg-black/30 border border-[#2563eb]/15 divide-y divide-white/5">
                  <div className="flex items-center justify-between px-4 py-2.5"><span className="text-xs text-gray-400">Fecha</span><span className="text-xs font-bold text-white capitalize">{dateLabel} · {data.reservation_time}</span></div>
                  <div className="flex items-center justify-between px-4 py-2.5"><span className="text-xs text-gray-400">Personas</span><span className="text-xs font-bold text-white">{data.party_size}</span></div>
                  <div className="flex items-center justify-between px-4 py-2.5"><span className="text-xs text-gray-400">Consultorio</span><span className="text-xs font-bold text-white">{data.table_number ? `Consultorio ${data.table_number}` : 'Por asignar'}</span></div>
                </div>
                <div className={`p-2.5 rounded-xl border text-xs font-bold text-center ${rm.cls}`}>
                  {data.status === 'pendiente' && '⏳ La clínica revisará y confirmará tu cita.'}
                  {data.status === 'confirmada' && '✅ ¡Tu cita está confirmada! Te esperamos.'}
                  {data.status === 'sentada' && '🩺 Estás en buenas manos. ¡Gracias por tu confianza!'}
                  {data.status === 'cancelada' && '❌ Esta cita fue cancelada.'}
                  {data.status === 'no_show' && '🚫 Esta cita quedó como no asistida.'}
                </div>
                <div className={`p-2.5 rounded-xl border text-xs font-bold text-center ${data.payment_status === 'pagado' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300' : 'bg-amber-500/10 border-amber-500/25 text-amber-200/90'}`}>{data.payment_status === 'pagado' ? '💳 Reserva pagada' : '💵 Pago de reserva pendiente'}</div>
                {Array.isArray(data.preorder_items) && data.preorder_items.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#2563eb]/10 border border-[#2563eb]/20"><p className="text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: accent }}>Tu pre-pedido</p><div className="space-y-1">{data.preorder_items.map((it: any, i: number) => (<div key={i} className="flex justify-between text-xs text-[#e8f1ff]/85"><span>{it.qty}x {it.name}</span>{it.price && <span className="font-mono" style={{ color: accent }}>{it.price}</span>}</div>))}</div></div>
                )}
                <p className="text-[10px] text-gray-500 text-center">Esta pantalla se actualiza sola cada pocos segundos.</p>
              </div>
            );
          })()
        ) : cancelled ? (
          <div className="text-center py-4 space-y-2"><div className="text-4xl">❌</div><p className="text-sm font-black text-red-400">Pedido cancelado</p><p className="text-xs text-gray-500">Código {data.code}</p></div>
        ) : (
          <div className="space-y-4">
            <div className="text-center"><div className="text-4xl">{ORDER_META[data.status]?.emoji ?? '📦'}</div><p className="text-lg font-black text-white mt-1">{ORDER_META[data.status]?.label ?? data.status}</p>{data.estimated_minutes ? <p className="text-xs font-bold mt-0.5" style={{ color: accent }}>Tiempo estimado: {data.estimated_minutes} min</p> : null}<p className="text-[10px] text-gray-500 mt-1 font-mono tracking-widest">Código {data.code}</p></div>
            {(data.payment_status === 'pagado' || data.status !== 'pendiente') ? (
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs font-bold text-center">✅ Pago confirmado</div>
            ) : data.payment_status === 'comprobante' ? (
              <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200/90 text-xs font-bold text-center">⏳ Comprobante recibido — esperando confirmación.</div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                <p className="text-[11px] text-amber-200/90 font-bold text-center">💵 Pago pendiente. Envía tu comprobante para que tu pedido avance.</p>
                <p className="text-center text-white font-black text-sm">${Number(data.total_price ?? 0).toFixed(2)} USD</p>
                {payLink && <a href={payLink} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: accent }} className="w-full py-2.5 rounded-lg text-white text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 hover:brightness-110">💳 Pagar en línea</a>}
                <button onClick={async () => { window.open(ecWaLink(waPhone, `¡Hola ${restaurantName || ''}! Adjunto el comprobante de pago de mi pedido #${data.code} por $${Number(data.total_price ?? 0).toFixed(2)} USD.`), '_blank'); if (!isMobilePreview && restaurantId) { try { await supabase.rpc('notify_gastro_payment', { p_restaurant_id: restaurantId, p_code: data.code }); fetchStatus(data.code); } catch (e) { console.error(e); } } }} className="w-full py-2.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2"><FaWhatsapp size={13} /> {payLink ? 'O envía tu comprobante' : 'Pagar · Enviar comprobante'}</button>
              </div>
            )}
            <div className="flex items-center justify-between gap-1">
              {steps.map((s, i) => {
                const done = i <= currentIdx;
                return (
                  <React.Fragment key={s}>
                    <div className="flex flex-col items-center gap-1 flex-1">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm border transition-all" style={done ? { backgroundColor: accent, borderColor: accent, color: '#fff' } : { background: 'rgba(0,0,0,0.4)', borderColor: 'rgba(255,255,255,0.1)', color: '#6b7280' }}>{done ? '✓' : i + 1}</div>
                      <span className="text-[8px] uppercase tracking-wide text-center" style={{ color: done ? accent : '#6b7280', fontWeight: done ? 700 : 400 }}>{ORDER_META[s]?.label}</span>
                    </div>
                    {i < steps.length - 1 && <div className="h-0.5 flex-1" style={{ background: i < currentIdx ? accent : 'rgba(255,255,255,0.1)' }} />}
                  </React.Fragment>
                );
              })}
            </div>
            {onInvoice && <button onClick={() => onInvoice(data.code)} className="w-full py-2.5 rounded-lg bg-white/5 border border-[#2563eb]/20 text-[#e8f1ff] text-xs font-black uppercase tracking-wider hover:bg-white/10 transition">🧾 ¿Necesitas factura?</button>}
            <p className="text-[10px] text-gray-500 text-center">Esta pantalla se actualiza sola cada pocos segundos.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════
// Factura
// ════════════════════════════════════════════════════════════════════════
const InvoiceModal: React.FC<{ restaurantId: string | null; code: string; isMobilePreview: boolean; accent: string; onClose: () => void; }> = ({ restaurantId, code, isMobilePreview, accent, onClose }) => {
  const [fullName, setFullName] = useState(''); const [name, setName] = useState(''); const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState(''); const [email, setEmail] = useState(''); const [address, setAddress] = useState('');
  const [memberCode, setMemberCode] = useState(''); const [loadingMember, setLoadingMember] = useState(false);
  const [submitting, setSubmitting] = useState(false); const [done, setDone] = useState(false); const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const prefillFromMember = async () => {
    if (!memberCode.trim() || loadingMember) return;
    setLoadingMember(true);
    try {
      const { data } = await supabase.rpc('get_gastro_member', { p_restaurant_id: restaurantId, p_identifier: memberCode.trim() });
      if (data && data.found) {
        if (data.billing_full_name) setFullName(data.billing_full_name); else if (data.name) setFullName(data.name);
        if (data.billing_name) setName(data.billing_name); if (data.billing_tax_id) setTaxId(data.billing_tax_id);
        if (data.billing_phone) setPhone(data.billing_phone); if (data.billing_email) setEmail(data.billing_email);
        if (data.billing_address) setAddress(data.billing_address);
        if (!data.billing_name && !data.billing_tax_id) setErrorMsg('Miembro encontrado, sin datos de factura guardados. Complétalos abajo.'); else setErrorMsg(null);
      } else setErrorMsg('No encontramos ese código de miembro.');
    } catch (e) { console.error(e); } finally { setLoadingMember(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !name.trim() || !taxId.trim() || !phone.trim() || submitting) return;
    if (isMobilePreview) { setDone(true); return; }
    setSubmitting(true); setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('submit_gastro_invoice', { p_restaurant_id: restaurantId, p_code: code, p_name: name.trim(), p_tax_id: taxId.trim(), p_email: email.trim() || null, p_address: address.trim() || null, p_full_name: fullName.trim(), p_phone: phone.trim() });
      if (error) throw error;
      if (!data?.ok) { setErrorMsg('No encontramos tu pedido. Verifica el código.'); setSubmitting(false); return; }
      setDone(true);
    } catch (err: any) { console.error('submit_gastro_invoice error:', err); setErrorMsg(err?.message ? `No se pudo enviar: ${err.message}` : 'No se pudo enviar. Intenta de nuevo.'); } finally { setSubmitting(false); }
  };

  const inp = "w-full bg-black/40 border border-[#2563eb]/20 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#2563eb] placeholder-gray-600";
  return (
    <div className="fixed inset-0 z-[122] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b1b33] rounded-2xl border border-[#2563eb]/30 shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition"><FaTimes size={16} /></button>
        <h3 className="text-base font-black text-white flex items-center gap-2 mb-1">🧾 Solicitar factura</h3>
        <p className="text-[11px] text-gray-400 mb-4">Pedido <span className="font-mono" style={{ color: accent }}>{code}</span></p>
        {done ? (
          <div className="text-center py-4 space-y-3"><div className="text-5xl">✅</div><h4 className="text-base font-black text-white">¡Datos enviados!</h4><p className="text-sm text-gray-400">La clínica recibió tus datos y emitirá tu factura.</p><button onClick={onClose} style={{ backgroundColor: accent }} className="w-full mt-2 py-3 rounded-xl text-white font-black text-xs uppercase tracking-wider transition-all hover:brightness-110">Cerrar</button></div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
              <input value={memberCode} onChange={(e) => setMemberCode(e.target.value)} placeholder="¿Eres miembro? Tu código" className={`${inp} uppercase tracking-widest font-mono`} />
              <button type="button" onClick={prefillFromMember} disabled={!memberCode.trim() || loadingMember} className="px-4 rounded-xl bg-[#2563eb]/15 border border-[#2563eb]/30 text-xs font-black uppercase hover:bg-[#2563eb]/25 disabled:opacity-40 transition shrink-0" style={{ color: accent }}>{loadingMember ? '...' : 'Usar'}</button>
            </div>
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre completo *" className={inp} />
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre / Razón social (factura) *" className={inp} />
            <input required value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="Cédula / RUC *" className={inp} />
            <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono *" className={inp} />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className={inp} />
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección" className={inp} />
            {errorMsg && <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-200 text-[11px] font-bold text-center">{errorMsg}</div>}
            <button type="submit" disabled={submitting || !fullName.trim() || !name.trim() || !taxId.trim() || !phone.trim()} style={{ backgroundColor: accent }} className="w-full py-3.5 rounded-xl text-white font-black text-xs uppercase tracking-widest disabled:opacity-50 transition-all hover:brightness-110">{submitting ? 'Enviando...' : 'Enviar datos de factura'}</button>
          </form>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════
// Carnet VIP: consulta de membresía + puntos
// ════════════════════════════════════════════════════════════════════════
const MembershipLookup: React.FC<{ restaurantId: string | null; isMobilePreview: boolean; clubName?: string; accent: string; stampsReward?: string; allowDownload?: boolean; clinicName?: string; onJoinClick: () => void; }> = ({ restaurantId, isMobilePreview, clubName = 'Club de Pacientes', accent, stampsReward, allowDownload = false, clinicName, onJoinClick }) => {
  const [identifier, setIdentifier] = useState(''); const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null); const [notFound, setNotFound] = useState(false);
  const [medRecords, setMedRecords] = useState<any[]>([]); const [showMedHistory, setShowMedHistory] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const downloadHistoryPDF = async () => {
    if (pdfBusy || medRecords.length === 0) return;
    setPdfBusy(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const autoTable = (await import('jspdf-autotable')).default;
      const doc = new jsPDF();
      doc.setFontSize(18); doc.setTextColor(20, 20, 20);
      doc.text(clinicName || 'Historia Clínica', 14, 18);
      doc.setFontSize(11); doc.setTextColor(120, 120, 120);
      doc.text(`Paciente: ${result?.name || '-'}${result?.member_code ? ` · ${result.member_code}` : ''}`, 14, 25);
      doc.text(`Generado: ${new Date().toLocaleString('es-EC')}`, 14, 31);
      doc.setDrawColor(37, 99, 235); doc.setLineWidth(0.6); doc.line(14, 35, 196, 35);
      autoTable(doc, {
        startY: 42,
        head: [['Fecha', 'Tipo', 'Diagnóstico', 'Tratamiento', 'Medicación', 'Próx. visita']],
        body: medRecords.map((r: any) => [
          r.record_date || '', r.record_type || '', r.diagnosis || '', r.treatment || '', r.medications || '', r.next_visit_date || '',
        ]),
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' },
        styles: { fontSize: 8, cellPadding: 2.5, valign: 'top' },
      });
      doc.save(`historia-${(result?.member_code || 'paciente')}.pdf`);
    } catch (e) { console.error('pdf error:', e); alert('No se pudo generar el PDF. Intenta de nuevo.'); }
    finally { setPdfBusy(false); }
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || loading) return;
    setNotFound(false); setResult(null); setMedRecords([]); setShowMedHistory(false);
    if (isMobilePreview) { setResult({ found: true, member_code: 'DEMO12', name: 'Cliente Demo', is_vip: true, discount_percent: 10, visits: 3 }); return; }
    if (!restaurantId) { setNotFound(true); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_gastro_member', { p_restaurant_id: restaurantId, p_identifier: identifier.trim() });
      if (error) throw error;
      if (data && data.found) {
        setResult(data);
        // Intentar cargar historial médico (falla graciosamente si la tabla no existe aún)
        try {
          const { data: recs } = await supabase.rpc('get_medical_records', { p_restaurant_id: restaurantId, p_member_code: data.member_code });
          if (Array.isArray(recs) && recs.length > 0) setMedRecords(recs);
        } catch { /* tabla aún no creada — ignorar */ }
      } else { setNotFound(true); }
    } catch (err: any) { console.error('get_gastro_member error:', err); setNotFound(true); } finally { setLoading(false); }
  };

  // Sellos: 6 casillas; cada visita = 1 sello; el 6to es el premio.
  const StampRow: React.FC<{ visits: number }> = ({ visits }) => {
    const cycle = 6; const filled = visits % cycle === 0 && visits > 0 ? cycle : visits % cycle;
    return (
      <div className="mt-3 p-3 rounded-xl bg-black/30 border border-[#2563eb]/20">
        <div className="flex items-center justify-between mb-2"><p className="text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>🩺 Carnet de puntos</p><span className="text-[10px] text-gray-500">{filled}/{cycle}</span></div>
        <div className="flex items-center justify-between gap-1.5">
          {Array.from({ length: cycle }).map((_, i) => (
            <div key={i} className="flex-1 aspect-square rounded-lg flex items-center justify-center text-sm border" style={i < filled ? { backgroundColor: `${accent}22`, borderColor: `${accent}66`, color: accent } : { background: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.08)', color: '#4b5563' }}>{i === cycle - 1 ? '🎁' : <FaUserMd size={12} />}</div>
          ))}
        </div>
        {stampsReward && String(stampsReward).trim() && <p className="text-[11px] text-[#e8f1ff]/80 mt-2 leading-snug"><b style={{ color: accent }}>Premio:</b> {stampsReward}</p>}
      </div>
    );
  };

  if (result?.found || result?.member_code) {
    return (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1a38] via-[#07132b] to-[#0c2148] border border-[#2563eb]/30 p-5 shadow-2xl">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none" style={{ background: `${accent}26` }} />
        <div className="flex justify-between items-start mb-3">
          <div><div className="text-[10px] uppercase font-bold tracking-widest" style={{ color: `${accent}cc` }}>Expediente de Salud</div><h3 className="text-base font-bold text-white mt-0.5">{result.name || 'Tu Membresía'}</h3></div>
          {result.is_vip && <div className="px-2.5 py-1 rounded-lg bg-[#2563eb]/15 border border-[#2563eb]/30 text-[9px] font-black uppercase tracking-widest" style={{ color: accent }}>⭐ VIP</div>}
        </div>
        <div className="p-4 rounded-xl bg-black/40 border border-[#2563eb]/20 text-center">
          <div className="text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-1">Tu código de miembro</div>
          <div className="text-3xl font-mono font-black tracking-[0.3em]" style={{ color: accent }}>{result.member_code}</div>
        </div>
        <div className="mt-3"><MemberPlanBadge ownerId={restaurantId} identifier={result.member_code} system="gastro" accent={accent} /></div>
        <div className="flex items-center justify-between mt-3 text-xs"><span className="text-gray-400">{result.visits ?? 0} visita{(result.visits ?? 0) !== 1 ? 's' : ''}</span>{result.discount_percent ? <span className="text-emerald-400 font-bold">{result.discount_percent}% de descuento activo</span> : <span className="text-gray-500 italic">Sigue visitándonos para más beneficios</span>}</div>
        <StampRow visits={result.visits ?? 0} />
        {result.benefits && String(result.benefits).trim() && (
          <div className="mt-3 p-3 rounded-xl bg-[#2563eb]/10 border border-[#2563eb]/20"><p className="text-[10px] font-black uppercase tracking-widest mb-1" style={{ color: accent }}>🎁 Tus beneficios</p><p className="text-xs text-[#e8f1ff]/85 leading-snug whitespace-pre-wrap">{result.benefits}</p></div>
        )}
        {Array.isArray(result.movements) && result.movements.length > 0 && (
          <div className="mt-3"><p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Historial (carnet)</p><div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">{result.movements.map((m: any, i: number) => (<div key={i} className="flex items-center justify-between bg-black/30 border border-white/5 rounded-lg px-3 py-2"><div className="min-w-0"><span className="text-[11px] font-mono font-bold" style={{ color: accent }}>{m.code}</span><span className="text-[10px] text-gray-500 ml-2">{m.order_type === 'delivery' ? '🛵' : '🏥'} {new Date(m.created_at).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })}</span></div><div className="text-right shrink-0"><div className="text-xs font-bold text-white">${Number(m.total ?? 0).toFixed(2)}</div><div className="text-[9px] text-gray-500 capitalize">{m.status}</div></div></div>))}</div></div>
        )}
        {/* Historial médico resumido */}
        {medRecords.length > 0 && (
          <div className="mt-3">
            <button onClick={() => setShowMedHistory(s => !s)} className="w-full text-left text-[10px] font-black uppercase tracking-widest flex items-center justify-between py-1" style={{ color: `${accent}cc` }}>
              <span>📋 Historial médico ({medRecords.length} registro{medRecords.length !== 1 ? 's' : ''})</span>
              <span>{showMedHistory ? '▲' : '▼'}</span>
            </button>
            {showMedHistory && (
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto pr-1">
                {allowDownload && (
                  <button onClick={downloadHistoryPDF} disabled={pdfBusy}
                    className="w-full py-2.5 rounded-xl bg-[#2563eb]/15 border border-[#2563eb]/30 text-xs font-black uppercase tracking-wider disabled:opacity-50 transition flex items-center justify-center gap-2" style={{ color: accent }}>
                    📄 {pdfBusy ? 'Generando...' : 'Descargar mi historia (PDF)'}
                  </button>
                )}
                {medRecords.map((rec: any, i: number) => (
                  <div key={rec.id ?? i} className="bg-black/40 border border-[#2563eb]/15 rounded-xl p-3 text-xs">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-black text-white/90">{rec.record_type}</span>
                      <span className="text-gray-500 text-[10px]">{new Date(rec.record_date + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
                    </div>
                    {rec.pet_name && <div className="text-[#2563eb]/80 text-[10px] mb-1">🩺 {rec.pet_name}</div>}
                    {rec.diagnosis && <div className="text-white/75"><span className="text-gray-500 font-bold">Dx: </span>{rec.diagnosis}</div>}
                    {rec.treatment && <div className="text-white/75"><span className="text-gray-500 font-bold">Tto: </span>{rec.treatment}</div>}
                    {rec.medications && <div className="text-white/75"><span className="text-gray-500 font-bold">Med: </span>{rec.medications}</div>}
                    {rec.next_visit_date && <div className="mt-1 text-amber-300 text-[10px] font-bold">📅 Próxima: {new Date(rec.next_visit_date + 'T00:00:00').toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <button onClick={() => { setResult(null); setIdentifier(''); setMedRecords([]); setShowMedHistory(false); }} className="mt-3 w-full py-2 text-[11px] text-gray-500 hover:text-gray-300 transition">Consultar otra membresía</button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1a38] via-[#07132b] to-[#0c2148] border border-[#2563eb]/30 p-5 shadow-2xl">
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl pointer-events-none" style={{ background: `${accent}26` }} />
      <div className="flex justify-between items-start mb-4">
        <div><div className="text-[10px] uppercase font-bold tracking-widest" style={{ color: `${accent}cc` }}>Expediente de Salud</div><h3 className="text-base font-bold text-white mt-0.5">Mi carnet de paciente</h3></div>
        <div className="px-2.5 py-1 rounded-lg bg-[#2563eb]/10 border border-[#2563eb]/20 text-[9px] font-black uppercase tracking-widest" style={{ color: accent }}>VIP</div>
      </div>
      <p className="text-xs text-gray-400 mb-3 leading-relaxed">¿Ya eres miembro? Ingresa tu código, email o teléfono para ver tu carnet, tus puntos y beneficios.</p>
      <form onSubmit={handleLookup} className="space-y-2.5">
        <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="Tu código, email o teléfono" className="w-full bg-black/40 border border-[#2563eb]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#2563eb] placeholder-gray-600" />
        <button type="submit" disabled={loading || !identifier.trim()} style={{ backgroundColor: accent }} className="w-full py-3 rounded-xl text-white font-black text-xs uppercase tracking-wider disabled:opacity-50 transition-all active:scale-95 hover:brightness-110">{loading ? 'Buscando...' : 'Ver mi carnet'}</button>
      </form>
      {notFound && (<div className="mt-3 text-center"><p className="text-[11px] text-gray-400 mb-2">No encontramos esa membresía.</p><button onClick={onJoinClick} className="text-[11px] font-black uppercase tracking-wider transition" style={{ color: accent }}>🩺 Afíliate al {clubName} →</button></div>)}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════
// Afiliación VIP (captura de leads → join_gastro_club)
// ════════════════════════════════════════════════════════════════════════
const ClubPetModal: React.FC<{ restaurantId: string | null; isMobilePreview: boolean; clubName?: string; clubTagline?: string; accent: string; onClose: () => void; }> = ({ restaurantId, isMobilePreview, clubName = 'Club de Pacientes', clubTagline = 'Beneficios exclusivos para nuestros pacientes', accent, onClose }) => {
  const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState('');
  const [petName, setPetName] = useState('');
  const [submitting, setSubmitting] = useState(false); const [done, setDone] = useState(false);
  const [member, setMember] = useState<{ member_code?: string; is_vip?: boolean; discount_percent?: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || submitting) return;
    if (isMobilePreview) { setMember({ member_code: 'DEMO12' }); setDone(true); return; }
    if (!restaurantId) { setErrorMsg('No se pudo identificar la clínica. Recarga la página.'); return; }
    setSubmitting(true); setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('join_gastro_club', { p_restaurant_id: restaurantId, p_name: petName.trim() ? `${name.trim()} (${petName.trim()})` : name.trim(), p_email: email.trim(), p_phone: phone.trim() || null });
      if (error) throw error;
      setMember(data || null); setDone(true);
    } catch (err: any) { console.error('join_gastro_club error:', err); setErrorMsg(err?.message ? `No se pudo registrar: ${err.message}` : 'No se pudo registrar. Intenta de nuevo.'); } finally { setSubmitting(false); }
  };

  const inp = "w-full bg-black/40 border border-[#2563eb]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#2563eb] placeholder-gray-600";
  return (
    <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b1b33] rounded-2xl border border-[#2563eb]/30 shadow-2xl p-6 relative" onClick={(e) => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition"><FaTimes size={16} /></button>
        {done ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-5xl">🩺</div><h3 className="text-lg font-black text-white">¡Bienvenido al {clubName}!</h3>
            {member?.member_code && (<div className="my-2 p-4 rounded-xl bg-black/40 border border-[#2563eb]/30"><div className="text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-1">Tu código de miembro</div><div className="text-3xl font-mono font-black tracking-[0.3em]" style={{ color: accent }}>{member.member_code}</div>{member.is_vip && <div className="mt-1 text-[10px] font-black uppercase tracking-widest" style={{ color: accent }}>⭐ Cliente VIP</div>}{member.discount_percent ? <div className="text-[11px] text-emerald-400 font-bold mt-0.5">{member.discount_percent}% de descuento</div> : null}</div>)}
            <p className="text-sm text-gray-400">Guarda tu código y muéstralo en cada visita para acumular puntos y reclamar beneficios.</p>
            <button onClick={onClose} style={{ backgroundColor: accent }} className="w-full mt-2 py-3 rounded-xl text-white font-black text-xs uppercase tracking-wider transition-all hover:brightness-110">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4"><div className="w-11 h-11 rounded-xl bg-[#2563eb]/15 flex items-center justify-center text-xl shrink-0">🩺</div><div><h3 className="text-base font-black text-white leading-tight">Afíliate al {clubName}</h3><p className="text-[11px] text-gray-400 mt-0.5">{clubTagline}</p></div></div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <input required type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre *" className={inp} />
              <input type="text" value={petName} onChange={(e) => setPetName(e.target.value)} placeholder="Familiar o dependiente (opcional)" className={inp} />
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@email.com *" className={inp} />
              <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono (para recordatorios)" className={inp} />
              {errorMsg && <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold text-center">{errorMsg}</div>}
              <button type="submit" disabled={submitting || !name.trim() || !email.trim()} style={{ backgroundColor: accent }} className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-white disabled:opacity-50 transition-all active:scale-95 hover:brightness-110">{submitting ? 'Registrando...' : '🩺 ¡Quiero afiliarme!'}</button>
            </form>
            <p className="text-[10px] text-gray-600 text-center mt-3">Sin spam. Solo recordatorios de citas y novedades.</p>
          </>
        )}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════
// Agendamiento clínico: datos del paciente + servicio + pago anticipado
// ════════════════════════════════════════════════════════════════════════
const ReserveModal: React.FC<{
  restaurantId: string | null; isMobilePreview: boolean;
  settings: { maxPartySize?: number; openTime?: string; closeTime?: string; daysAhead?: number; autoConfirm?: boolean };
  restaurantName?: string; services: string[]; initialService?: string; dishes?: any[]; accent: string; payLink?: string; waPhone?: string; onClose: () => void;
}> = ({ restaurantId, isMobilePreview, settings, restaurantName, services, initialService = '', dishes = [], accent, payLink, waPhone, onClose }) => {
  const maxParty = settings.maxPartySize ?? 4;
  const openTime = settings.openTime ?? '09:00';
  const closeTime = settings.closeTime ?? '19:00';
  const daysAhead = settings.daysAhead ?? 30;
  const today = new Date();
  const minDate = today.toISOString().slice(0, 10);
  const maxDate = new Date(today.getTime() + daysAhead * 86400000).toISOString().slice(0, 10);

  const slots = useMemo(() => {
    const out: string[] = []; const [oh, om] = openTime.split(':').map(Number); const [ch, cm] = closeTime.split(':').map(Number);
    let t = oh * 60 + om; const end = ch * 60 + cm;
    while (t <= end) { out.push(`${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`); t += 30; }
    return out;
  }, [openTime, closeTime]);

  const [service, setService] = useState(initialService || services[0] || 'Consulta general');
  const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [petName, setPetName] = useState(''); const [breed, setBreed] = useState(''); const [age, setAge] = useState('');
  const [party, setParty] = useState(1);
  const [date, setDate] = useState(minDate); const [time, setTime] = useState(slots[0] || '10:00');
  const [notes, setNotes] = useState(''); const [memberCode, setMemberCode] = useState('');
  const [memberLookupLoading, setMemberLookupLoading] = useState(false);
  const [memberLookupInfo, setMemberLookupInfo] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ code?: string; status?: string } | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inp = "w-full bg-black/40 border border-[#2563eb]/20 text-white text-sm rounded-xl px-4 py-3 focus:outline-none focus:border-[#2563eb] placeholder-gray-600";

  const lookupMember = async () => {
    if (!memberCode.trim() || memberLookupLoading || isMobilePreview) return;
    setMemberLookupLoading(true);
    try {
      const { data } = await supabase.rpc('get_gastro_member', { p_restaurant_id: restaurantId, p_identifier: memberCode.trim() });
      if (data?.found) {
        setMemberLookupInfo(data);
        const ownerName = data.name?.includes('(') ? data.name.split('(')[0].trim() : (data.name || '');
        const dependent = data.name?.includes('(') ? data.name.slice(data.name.indexOf('(') + 1, data.name.lastIndexOf(')')).trim() : '';
        if (ownerName && !name.trim()) setName(ownerName);
        if (data.phone && !phone.trim()) setPhone(data.phone);
        if (data.email && !email.trim()) setEmail(data.email);
        // Autocompletar el nombre del paciente: el dependiente si existe, si no el titular.
        if (!petName.trim()) setPetName(dependent || ownerName);
      } else { setMemberLookupInfo({ found: false }); }
    } catch (e) { console.error(e); } finally { setMemberLookupLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim() || !date || !time || !petName.trim() || submitting) return;
    const patientNote = `Servicio: ${service}. Paciente: ${petName.trim()}${age.trim() ? ', ' + age.trim() : ''}${breed.trim() ? ', doc ' + breed.trim() : ''}.${notes.trim() ? ' Motivo: ' + notes.trim() : ''}`;
    if (isMobilePreview) { setResult({ code: 'DEMO5', status: settings.autoConfirm ? 'confirmada' : 'pendiente' }); return; }
    if (!restaurantId) { setErrorMsg('No se pudo identificar la clínica. Recarga la página.'); return; }
    setSubmitting(true); setErrorMsg(null);
    try {
      const { data, error } = await supabase.rpc('place_gastro_reservation', {
        p_restaurant_id: restaurantId, p_name: name.trim(), p_phone: phone.trim(), p_email: email.trim() || null,
        p_party_size: party, p_date: date, p_time: time, p_notes: patientNote, p_member_code: memberCode.trim() || null,
        p_items: null,
      });
      if (error) throw error;
      if (!data?.ok) { setErrorMsg('No se pudo crear la cita. Intenta de nuevo.'); setSubmitting(false); return; }
      setResult({ code: data.confirmation_code, status: data.status });
    } catch (err: any) { console.error('place_gastro_reservation error:', err); setErrorMsg(err?.message ? `No se pudo agendar: ${err.message}` : 'No se pudo agendar. Intenta de nuevo.'); } finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-sm bg-[#0b1b33] rounded-2xl border border-[#2563eb]/30 shadow-2xl p-6 relative max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-white transition"><FaTimes size={16} /></button>
        {result ? (
          <div className="text-center py-4 space-y-3">
            <div className="text-5xl">{result.status === 'confirmada' ? '✅' : '📅'}</div>
            <h3 className="text-lg font-black text-white">{result.status === 'confirmada' ? '¡Cita confirmada!' : '¡Cita recibida!'}</h3>
            {result.code && (<div className="my-2 p-4 rounded-xl bg-black/40 border border-[#2563eb]/30"><div className="text-[9px] uppercase font-bold tracking-widest text-gray-500 mb-1">Código de cita</div><div className="text-3xl font-mono font-black tracking-[0.3em]" style={{ color: accent }}>{result.code}</div></div>)}
            <p className="text-sm text-gray-400">{result.status === 'confirmada' ? `Te esperamos el ${new Date(date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long' })} a las ${time}.` : `${restaurantName || 'La clínica'} revisará tu cita y te confirmará por WhatsApp.`}</p>
            <div className="text-left p-3 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <p className="text-[11px] text-amber-200/90 font-bold leading-snug">💳 Para bloquear el horario, paga la consulta por adelantado:</p>
              {payLink && <a href={payLink} target="_blank" rel="noopener noreferrer" style={{ backgroundColor: accent }} className="mt-2 w-full py-2.5 rounded-lg text-white text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2 hover:brightness-110">💳 Pagar en línea</a>}
              <button onClick={() => window.open(ecWaLink(waPhone, `¡Hola ${restaurantName || ''}! Quiero pagar por adelantado mi cita #${result.code} (${service}).`), '_blank')} className="mt-2 w-full py-2.5 rounded-lg bg-[#25D366] hover:bg-[#1ebe5d] text-white text-xs font-black uppercase tracking-wider transition flex items-center justify-center gap-2"><FaWhatsapp size={13} /> Pagar · Enviar comprobante</button>
            </div>
            <button onClick={onClose} style={{ backgroundColor: accent }} className="w-full mt-2 py-3 rounded-xl text-white font-black text-xs uppercase tracking-wider transition-all hover:brightness-110">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 mb-4"><div className="w-11 h-11 rounded-xl bg-[#2563eb]/15 flex items-center justify-center text-xl shrink-0">🩺</div><div><h3 className="text-base font-black text-white leading-tight">Agendar una cita</h3><p className="text-[11px] text-gray-400 mt-0.5">Datos del paciente + fecha y hora.</p></div></div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 mb-4"><FaShieldAlt className="text-amber-400 shrink-0 mt-0.5" size={12} /><p className="text-[11px] text-amber-200/80 leading-snug">Pedimos los datos del paciente y el pago de la consulta por adelantado. Si no se paga la reserva, el horario no queda bloqueado.</p></div>
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* ¿Paciente recurrente? Código primero → autocompleta todo */}
              <div className="rounded-xl border border-[#2563eb]/25 bg-[#2563eb]/5 p-3">
                <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5 flex items-center gap-1.5" style={{ color: accent }}><FaStar size={10} /> ¿Ya eres paciente? Ingresa tu código</label>
                <div className="flex gap-2">
                  <input value={memberCode} onChange={e => { setMemberCode(e.target.value); setMemberLookupInfo(null); }} placeholder="Código, email o teléfono" className={`${inp} flex-1 uppercase tracking-widest font-mono`} />
                  <button type="button" onClick={lookupMember} disabled={!memberCode.trim() || memberLookupLoading} className="shrink-0 px-3.5 rounded-xl bg-[#2563eb]/15 border border-[#2563eb]/30 text-xs font-black uppercase disabled:opacity-40 transition" style={{ color: accent }}>{memberLookupLoading ? '...' : 'Autocompletar'}</button>
                </div>
                {memberLookupInfo?.found && (
                  <div className="mt-1.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center gap-1.5">✅ {memberLookupInfo.name || 'Paciente encontrado'} — datos completados</div>
                )}
                {memberLookupInfo && !memberLookupInfo.found && (
                  <div className="mt-1.5 p-2 rounded-lg bg-white/5 border border-[#2563eb]/15 text-xs text-gray-400">No encontramos esa membresía. Puedes continuar y llenar tus datos.</div>
                )}
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Servicio</label>
                <select value={service} onChange={(e) => setService(e.target.value)} className={inp}>{services.map(s => <option key={s} value={s}>{s}</option>)}</select>
              </div>
              <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre *" className={inp} />
              <input required type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono / WhatsApp *" className={inp} />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (opcional)" className={inp} />
              <div className="rounded-xl border border-[#2563eb]/15 bg-black/20 p-3 space-y-2.5">
                <p className="text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5" style={{ color: accent }}><FaUserMd size={11} /> Datos del paciente</p>
                <input required value={petName} onChange={(e) => setPetName(e.target.value)} placeholder="Nombre del paciente *" className={inp} />
                <div className="grid grid-cols-2 gap-2">
                  <input value={age} onChange={(e) => setAge(e.target.value)} placeholder="Edad (ej. 34 años)" className={inp} />
                  <input value={breed} onChange={(e) => setBreed(e.target.value)} placeholder="Cédula / Documento" className={inp} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Fecha</label><input required type="date" value={date} min={minDate} max={maxDate} onChange={(e) => setDate(e.target.value)} className={inp} /></div>
                <div><label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Hora</label><select required value={time} onChange={(e) => setTime(e.target.value)} className={inp}>{slots.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              </div>
              <div>
                <label className="block text-[10px] text-gray-500 uppercase tracking-widest font-bold mb-1">Personas</label>
                <div className="flex items-center gap-3 bg-black/40 border border-[#2563eb]/20 rounded-xl px-4 py-2.5">
                  <button type="button" onClick={() => setParty(p => Math.max(1, p - 1))} className="w-8 h-8 rounded-lg bg-white/5 border border-[#2563eb]/10 flex items-center justify-center text-sm font-black text-white">−</button>
                  <span className="font-mono font-bold text-white flex-1 text-center">{party}</span>
                  <button type="button" onClick={() => setParty(p => Math.min(maxParty, p + 1))} className="w-8 h-8 rounded-lg bg-white/5 border border-[#2563eb]/10 flex items-center justify-center text-sm font-black text-white">+</button>
                </div>
                <p className="text-[10px] text-gray-600 mt-1">Máximo {maxParty} personas por cita.</p>
              </div>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Motivo / síntomas (opcional)" rows={2} className={`${inp} resize-none`} />
              {errorMsg && <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs font-bold text-center">{errorMsg}</div>}
              <button type="submit" disabled={submitting || !name.trim() || !phone.trim() || !petName.trim()} style={{ backgroundColor: accent }} className="w-full py-3.5 rounded-xl font-black text-sm uppercase tracking-wider text-white hover:brightness-110 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"><FaCalendarAlt size={13} /> {submitting ? 'Agendando...' : 'Confirmar cita'}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};
