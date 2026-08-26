import { profileStyleLayer } from '../src/lib/profileStyleLayer';
import React, { useState, useEffect, useMemo } from 'react';
import { MemberPlanBadge } from './MemberPlanCard';
import { supabase } from '../src/lib/supabase';
import { ProfileExtraSections } from './ProfileExtraSections';
import FullCatalogView from './FullCatalogView';
import type { Profile, UserLink, BarberPaymentGatewaysConfig, BarberPaymentMethodType } from '../types';
import { useBarberPayment, barberWaNumber } from '../hooks/useBarberPayment';
import {
  FaWhatsapp, FaEnvelope, FaShareAlt, FaPhoneAlt,
  FaMapMarkerAlt, FaQrcode, FaChevronDown,
  FaAward, FaCut, FaUsers, FaClock, FaStar, FaFolderOpen, FaQuestionCircle,
  FaSignOutAlt, FaCheckCircle, FaTimes, FaGift,
  FaLink, FaMobileAlt, FaUniversity, FaCopy, FaBoxOpen,
  FaCalendarAlt, FaUserTie,
} from 'react-icons/fa';
import { useLanguage } from '../contexts/LanguageContext';

interface ProfileBarberTemplateProps {
  profile: Profile;
  links: UserLink[];
  onLinkClick?: (linkId: string) => void;
  onSelectProduct?: (product: any) => void;
  onOpenLeadForm?: () => void;
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

export const ProfileBarberTemplate: React.FC<ProfileBarberTemplateProps> = ({
  profile,
  links,
  onLinkClick,
  onSelectProduct,
  onOpenLeadForm,
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
  const { t } = useLanguage();
  const [subProfiles, setSubProfiles] = useState<any[]>([]);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // Club Barber
  const [showClubModal, setShowClubModal] = useState(false);
  const [selectedService, setSelectedService] = useState<any | null>(null);
  // Vista de catálogo a página completa ("Ver todo"): servicios o productos.
  const [fullCatalog, setFullCatalog] = useState<null | 'services' | 'products'>(null);
  const toCatalogItem = (p: any) => ({
    id: String(p.id),
    name: p.name,
    price: p.price,
    image: p.imageURL,
    category: p.category,
    description: p.shortDescription,
    disabled: p.available === false,
    raw: p,
  });
  const serviceItems = useMemo(
    () => (Array.isArray(profile?.products) ? profile.products.filter((p: any) => p.available !== false) : []).map(toCatalogItem),
    [profile?.products]
  );
  const productItems = useMemo(
    () => (Array.isArray((profile as any)?.barber_products) ? (profile as any).barber_products.filter((p: any) => p.available !== false) : []).map(toCatalogItem),
    [(profile as any)?.barber_products]
  );

  // Reservas de cita (equipo de barberos + agenda)
  const [staffList, setStaffList] = useState<any[]>([]);
  const [showReservationModal, setShowReservationModal] = useState(false);

  // Local gallery albums states
  const [selectedAlbum, setSelectedAlbum] = useState<any | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number>(-1);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);

  // Detect associated sub-profiles under same master email (ULTRA feature)
  useEffect(() => {
    if (profile.plan === 'ultra' && profile.email) {
      supabase
        .from('profiles')
        .select('username, displayName, profilePhotoURL')
        .eq('email', profile.email)
        .then(({ data, error }) => {
          if (data && !error && data.length > 1) {
            setSubProfiles(data);
          }
        });
    }
  }, [profile.plan, profile.email]);

  // Cargar el equipo activo (solo ULTRA) para habilitar reservas de cita.
  useEffect(() => {
    if (profile.plan === 'ultra' && profile.id) {
      supabase
        .from('barber_staff')
        .select('id, name, role, photo_url, working_hours, is_active')
        .eq('barber_id', profile.id)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .then(({ data, error }) => {
          if (data && !error) setStaffList(data);
        });
    }
  }, [profile.plan, profile.id]);

  const handleSubProfileChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedUsername = e.target.value;
    if (selectedUsername) {
      if (isMobilePreview) {
        alert(`Navegar a: /${selectedUsername} (Desactivado en vista previa)`);
      } else {
        window.location.href = `/${selectedUsername}`;
      }
    }
  };

  const getEmbedUrl = (url: string) => {
    if (!url) return '';
    try {
      const videoUrl = new URL(url);
      let videoId = '';
      if (videoUrl.hostname.includes('youtube.com') || videoUrl.hostname.includes('youtu.be')) {
        videoId = videoUrl.searchParams.get('v') || videoUrl.pathname.split('/').pop() || '';
        return `https://www.youtube.com/embed/${videoId}`;
      } else if (videoUrl.hostname.includes('vimeo.com')) {
        videoId = videoUrl.pathname.split('/').pop() || '';
        return `https://player.vimeo.com/video/${videoId}`;
      }
    } catch (e) {
      console.error('Error parsing video URL', e);
    }
    return url;
  };

  const plan = profile.plan ? profile.plan.toLowerCase() : 'free';
  const isProOrUltra = plan === 'pro' || plan === 'ultra';
  const isUltra = plan === 'ultra';
  // Organizar secciones: visible salvo que el dueño la oculte explícitamente.
  const sectionOn = (k: string) => (profile as any)?.sectionVisibility?.[k] !== false;
  // Color de acento del cliente (Apariencia). Fallback al de la plantilla.
  const accent = (profile?.buttonColor && String(profile.buttonColor).trim()) || '#ff6b35';
  // Estilo de botón, sombra y borde elegidos por el cliente (vacío si no eligió).
  const cnxLayer = profileStyleLayer(profile);

  // Locations array helper
  const locationsToShow = Array.isArray(profile.locations) && profile.locations.length > 0
    ? profile.locations
    : profile.location
      ? [profile.location]
      : [];

  return (
    <div
      className={`min-h-screen relative overflow-hidden pb-12 ${cnxLayer.className}`}
      style={{
        // Personalizables desde Apariencia; si el cliente no eligió nada,
        // se usan los valores propios de la plantilla.
        ...cnxLayer.style,
        // El naranja de la barbería estaba escrito a mano en 18 clases de
        // Tailwind. Ahora esas clases leen esta variable, así que el color de
        // acento elegido por el cliente tiñe toda la plantilla y no sólo el
        // botón de agendar. (Las 6 que llevan modificador de opacidad —los
        // lavados al 5% y los hover al 20%— se quedan con el naranja base:
        // Tailwind no resuelve ese modificador sobre var() de forma fiable y
        // perderlas en silencio sería peor que la pequeña diferencia de matiz.)
        ['--cnx-accent' as any]: accent,
        backgroundColor: profile?.backgroundColor || '#050505',
        color: profile?.textColor || '#ffefe5',
        fontFamily: profile?.fontFamily || "'Space Grotesk', sans-serif"
      }}
    >
      {/* Film grain overlay */}
      <div className="cinema-grain" aria-hidden="true" />

      <div className="cinema-animate-in">
        {/* Background Decorative Gradient overlay */}
      <div className="absolute top-0 left-0 w-full h-[600px] bg-gradient-to-b from-[#ff6b35]/5 via-transparent to-transparent pointer-events-none" />

      {/* 1. Identity Layer (Header) */}
      <div className="relative">
        {/* Cover Image */}
        {profile.coverImageURL ? (
          <div className="w-full h-52 sm:h-72 overflow-hidden relative">
            <img
              src={profile.coverImageURL}
              alt="Cover"
              className="cinema-hero-cover w-full h-full object-cover"
              style={{ filter: 'brightness(0.65) saturate(1.1)' }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/20 to-black/30 pointer-events-none" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20 pointer-events-none" />
          </div>
        ) : (
          <div className="w-full h-36 bg-gradient-to-br from-[#1a0800] to-[#050505] relative border-b border-[#962700]/10" />
        )}

        {/* Profile Card & Avatar */}
        <div className="relative flex flex-col items-center px-4 -mt-16 sm:-mt-20">
          <div className="relative">
            {profile.profilePhotoURL && (
              <div className="relative">
                <div
                  className="cinema-glow-ring absolute inset-0 rounded-full blur-xl"
                  style={{ background: 'radial-gradient(circle, #ffa35d55, transparent 70%)', transform: 'scale(1.4)' }}
                />
                <img
                  src={profile.profilePhotoURL}
                  alt="Avatar"
                  className="cinema-animate-in w-28 h-28 sm:w-36 sm:h-36 rounded-full object-cover relative z-10"
                  style={{
                    border: '2px solid rgba(255,163,93,0.3)',
                    boxShadow: '0 0 0 4px #050505, 0 20px 60px rgba(0,0,0,0.9), 0 4px 20px rgba(255,107,53,0.2)'
                  }}
                />
              </div>
            )}
          </div>

          <div className="mt-4 text-center max-w-lg">
            <h1 className="text-3xl font-bold font-tomorrow italic tracking-wider text-[#ffefe5] drop-shadow-md">
              {profile.displayName}
            </h1>
            {profile.jobTitle && (
              <p className="text-sm font-tomorrow uppercase tracking-widest text-[#ffa35d] mt-1 font-bold">
                {profile.jobTitle} {profile.company ? `| ${profile.company}` : ''}
              </p>
            )}
            {profile.bio && (
              <p className="mt-3 text-xs leading-relaxed text-[#ffefe5]/70 max-w-md mx-auto italic px-2">
                "{profile.bio}"
              </p>
            )}
            {locationsToShow.length > 0 && (
              <div className="flex flex-col items-center gap-1.5 mt-3">
                {locationsToShow.map((loc, index) => (
                  <a
                    key={`${loc}-${index}`}
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-[#ffefe5]/75 hover:text-[#ffa35d] transition-colors"
                  >
                    <FaMapMarkerAlt className="text-[#ffa35d] w-3 h-3 shrink-0" />
                    <span className="leading-none">{loc}</span>
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 1.1 Team Selector (Ultra Extra 1) */}
      {isUltra && subProfiles.length > 0 && (
        <div className="w-full max-w-xs mx-auto mt-6 px-4">
          <div className="relative glass-panel rounded-xl border border-[#962700]/30 overflow-hidden flex items-center px-3 bg-black/40">
            <FaUsers className="text-[#ffa35d] w-4 h-4 mr-2" />
            <select
              value=""
              onChange={handleSubProfileChange}
              className="w-full bg-transparent text-xs py-3 text-[#ffefe5] focus:outline-none cursor-pointer pr-8 appearance-none font-tomorrow uppercase tracking-widest font-bold"
            >
              <option value="" disabled className="bg-[#050505] text-[#ffefe5]/50">
                {t('select_barber') || 'NUESTRO EQUIPO'}
              </option>
              {subProfiles.map((sub) => (
                <option key={sub.username} value={sub.username} className="bg-[#050505] text-[#ffefe5]">
                  {sub.displayName}
                </option>
              ))}
            </select>
            <div className="absolute right-3 pointer-events-none text-[#ffa35d]">
              <FaChevronDown className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}

      {/* 1.2 Primary Contact Actions */}
      <div className="w-full max-w-md mx-auto flex justify-center gap-3 mt-6 px-4">
        {profile.phone && (
          <a
            href={`tel:${profile.phone}`}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 hover:border-[#ffa35d]/40 text-[#ffefe5] hover:text-[#ffa35d] transition-all hover:scale-105"
            title="Llamar"
          >
            <FaPhoneAlt size={16} />
          </a>
        )}
        {profile.whatsapp && (
          <a
            href={`https://wa.me/${profile.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 hover:border-[#ffa35d]/40 text-[#ffefe5] hover:text-[#ffa35d] transition-all hover:scale-105"
            title="WhatsApp"
          >
            <FaWhatsapp size={18} />
          </a>
        )}
        {profile.contactEmail && (
          <a
            href={`mailto:${profile.contactEmail}`}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-white/5 border border-white/10 hover:border-[#ffa35d]/40 text-[#ffefe5] hover:text-[#ffa35d] transition-all hover:scale-105"
            title="Email"
          >
            <FaEnvelope size={16} />
          </a>
        )}
      </div>

      {/* 1.3 Secondary Actions */}
      <div className="flex flex-wrap justify-center gap-2 mt-4 px-4 text-xs font-bold uppercase tracking-wider font-tomorrow">
        {downloadVCard && (
          <button
            onClick={downloadVCard}
            disabled={isVCardLoading}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-[#ff6b35]/20 text-[#ffefe5] rounded-xl border border-white/10 hover:border-[#ffa35d]/40 transition active:scale-95 disabled:opacity-50 min-h-[44px]"
          >
            <span>📥</span>
            <span>{isVCardLoading ? '...' : t('save') || 'Guardar'}</span>
          </button>
        )}
        {handleShare && (
          <button
            onClick={handleShare}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-[#ff6b35]/20 text-[#ffefe5] rounded-xl border border-white/10 hover:border-[#ffa35d]/40 transition active:scale-95 min-h-[44px]"
          >
            <FaShareAlt size={12} />
            <span>{t('share') || 'Compartir'}</span>
          </button>
        )}
        {setShowQRModal && (
          <button
            onClick={() => setShowQRModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-[#ff6b35]/20 text-[#ffefe5] rounded-xl border border-white/10 hover:border-[#ffa35d]/40 transition active:scale-95 min-h-[44px]"
          >
            <FaQrcode size={12} />
            <span>QR</span>
          </button>
        )}
        {isUltra && currentUser && visitorProfile?.plan === 'ultra' && userId && currentUser.id !== userId && handleStartChat && (
          <button
            onClick={handleStartChat}
            disabled={isStartingChat}
            className="flex items-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-[#ff6b35]/20 text-[#ffefe5] rounded-xl border border-white/10 hover:border-[#ffa35d]/40 transition active:scale-95 disabled:opacity-50 min-h-[44px]"
          >
            <FaEnvelope size={12} />
            <span>{isStartingChat ? '...' : t('message') || 'Mensaje'}</span>
          </button>
        )}
      </div>

      {/* Social Media Links */}
      {sectionOn('social') && profile.socialMedia && Object.values(profile.socialMedia).some(Boolean) && (
        <div className="flex justify-center flex-wrap gap-2 mt-5 px-4">
          {profile.socialMedia.instagram && (
            <a href={`https://instagram.com/${profile.socialMedia.instagram.replace('@','')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ffa35d]/20 text-[#ffefe5]/70 hover:text-[#ffefe5] transition" title="Instagram">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.facebook && (
            <a href={profile.socialMedia.facebook.startsWith('http') ? profile.socialMedia.facebook : `https://facebook.com/${profile.socialMedia.facebook}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ffa35d]/20 text-[#ffefe5]/70 hover:text-[#ffefe5] transition" title="Facebook">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.tiktok && (
            <a href={`https://tiktok.com/@${profile.socialMedia.tiktok.replace('@','')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ffa35d]/20 text-[#ffefe5]/70 hover:text-[#ffefe5] transition" title="TikTok">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.twitter && (
            <a href={`https://x.com/${profile.socialMedia.twitter.replace('@','')}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ffa35d]/20 text-[#ffefe5]/70 hover:text-[#ffefe5] transition" title="X / Twitter">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.75l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.youtube && (
            <a href={profile.socialMedia.youtube.startsWith('http') ? profile.socialMedia.youtube : `https://youtube.com/@${profile.socialMedia.youtube}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ffa35d]/20 text-[#ffefe5]/70 hover:text-[#ffefe5] transition" title="YouTube">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.linkedin && (
            <a href={profile.socialMedia.linkedin.startsWith('http') ? profile.socialMedia.linkedin : `https://linkedin.com/in/${profile.socialMedia.linkedin}`}
              target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ffa35d]/20 text-[#ffefe5]/70 hover:text-[#ffefe5] transition" title="LinkedIn">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </a>
          )}
          {profile.socialMedia.website && (
            <a href={profile.socialMedia.website} target="_blank" rel="noopener noreferrer"
              className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 hover:border-[#ffa35d]/20 text-[#ffefe5]/70 hover:text-[#ffefe5] transition" title="Sitio Web">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
            </a>
          )}
        </div>
      )}

      {/* Main Layout Grid */}
      <div className="w-full max-w-2xl mx-auto px-4 mt-8 space-y-6 cinema-animate-in-delay-2">

        {/* 1.4 About Me ("Sobre Mí") */}
        {profile.aboutMe && profile.aboutMe.trim() && (
          <div className="glass-panel rounded-2xl p-6 border border-white/5 relative overflow-hidden bg-black/40">
            <div className="absolute top-0 right-0 w-24 h-24 bg-[#ff6b35]/5 rounded-bl-full pointer-events-none" />
            <h3 className="text-sm font-bold uppercase tracking-wider font-tomorrow text-[#ffa35d] flex items-center mb-3">
              <FaAward className="mr-2" /> {t('about_me_label')}
            </h3>
            <p className="text-xs leading-relaxed text-[#ffefe5]/80 whitespace-pre-line">{profile.aboutMe}</p>
          </div>
        )}

        {/* Club Barber — Botón de inscripción */}
        {isProOrUltra && (
          <div className="rounded-2xl p-[1px] bg-gradient-to-r from-[var(--cnx-accent)] via-[#ffa35d] to-[var(--cnx-accent)]">
            <button
              onClick={() => setShowClubModal(true)}
              className="group w-full rounded-2xl bg-[#0f0702] px-5 py-4 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
            >
              <div className="w-11 h-11 rounded-xl bg-[#ffa35d]/15 flex items-center justify-center text-xl shrink-0">💈</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white font-tomorrow leading-tight">Únete al Club Barber</p>
                <p className="text-[11px] text-[#ffefe5]/60 mt-0.5 leading-snug">
                  Descuentos exclusivos, beneficios VIP y tu código de cliente.
                </p>
              </div>
              <FaGift className="text-[#ffa35d] text-lg shrink-0 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        )}

        {/* Club Barber — Consulta de membresía */}
        {isProOrUltra && (
          <BarberMembershipLookup
            barberId={profile.id}
            isMobilePreview={isMobilePreview}
            onJoinClick={() => setShowClubModal(true)}
            stampsReward={profile.stampsReward}
          />
        )}

        {/* Reservar cita — elige servicio y barbero (ULTRA + equipo activo) */}
        {isUltra && staffList.length > 0 && (
          <div className="rounded-2xl p-[1px] bg-gradient-to-r from-[var(--cnx-accent)] via-[#ffa35d] to-[var(--cnx-accent)]">
            <button
              onClick={() => setShowReservationModal(true)}
              className="group w-full rounded-2xl bg-[#0f0702] px-5 py-4 flex items-center gap-4 text-left active:scale-[0.99] transition-transform"
            >
              <div className="w-11 h-11 rounded-xl bg-[#ffa35d]/15 flex items-center justify-center text-xl shrink-0">📅</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-white font-tomorrow leading-tight">Reservar una cita</p>
                <p className="text-[11px] text-[#ffefe5]/60 mt-0.5 leading-snug">
                  Elige tu servicio, tu barbero favorito y la hora que prefieras.
                </p>
              </div>
              <FaCalendarAlt className="text-[#ffa35d] text-lg shrink-0 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        )}

        {/* Consultar el estado de una cita por código */}
        {isUltra && staffList.length > 0 && (
          <BarberReservationLookup barberId={profile.id} isMobilePreview={isMobilePreview} />
        )}

        {/* Booking Link */}
        {profile.bookingLink && isProOrUltra && (
          <a
            href={profile.bookingLink}
            target="_blank"
            rel="noopener noreferrer"
            style={{ backgroundColor: accent }}
            className="block w-full py-4 text-center font-bold text-base transition-all hover:brightness-110 hover:scale-[1.02] rounded-xl font-tomorrow uppercase tracking-wider shadow-lg text-black border border-transparent min-h-[52px]"
          >
            📅 Agendar Cita Online
          </a>
        )}

        {/* 2. Capa PRO Sections */}
        {isProOrUltra && (
          <>
            {/* Custom Links section */}
            {links.filter(l => l.isActive).length > 0 && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-black/40">
                <h3 className="text-sm font-bold uppercase tracking-wider font-tomorrow text-[#ffa35d] flex items-center mb-4">
                  <FaCut className="mr-2 rotate-90" /> {t('links_title') || 'Enlaces destacados'}
                </h3>
                <div className="space-y-3">
                  {links.filter(l => l.isActive).map(link => (
                    <a
                      key={link.id}
                      href={link.url}
                      onClick={() => onLinkClick?.(link.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block py-3.5 px-5 text-center font-bold text-sm bg-white/5 rounded-xl border border-white/10 hover:border-[#ffa35d]/40 text-[#ffefe5] hover:text-[#ffa35d] transition-all hover:scale-[1.01] hover:bg-white/10 font-tomorrow tracking-wider min-h-[48px]"
                    >
                      {link.title}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* 2.2 Servicios */}
            {sectionOn('products') && Array.isArray(profile.products) && profile.products.filter((p: any) => p.available !== false).length > 0 && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-black/40">
                <h3 className="text-sm font-bold uppercase tracking-wider font-tomorrow text-[#ffa35d] flex items-center mb-4">
                  ✂️ Nuestros Servicios
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {profile.products.filter((p: any) => p.available !== false).map((prod: any) => (
                    <div
                      key={prod.id}
                      onClick={() => setSelectedService(prod)}
                      className="bg-white/5 rounded-xl border border-white/5 hover:border-[#ffa35d]/40 overflow-hidden shadow-lg hover:scale-[1.02] hover:bg-white/10 transition duration-300 flex flex-col cursor-pointer active:scale-95"
                    >
                      {prod.imageURL ? (
                        <div className="w-full aspect-square overflow-hidden relative">
                          <img src={prod.imageURL} alt={prod.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-full aspect-square bg-[#ffa35d]/8 flex items-center justify-center text-3xl">✂️</div>
                      )}
                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="cnx-product-text font-bold text-xs text-[#ffefe5] font-tomorrow uppercase tracking-wider line-clamp-1">{prod.name}</h4>
                          {prod.shortDescription && <p className="text-[10px] text-[#ffefe5]/60 mt-1 line-clamp-2 leading-tight">{prod.shortDescription}</p>}
                        </div>
                        {prod.price && (
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs font-black text-[#ffa35d] font-tomorrow italic">{prod.price}</span>
                            <span className="text-[9px] text-white/50 border border-white/20 rounded-md px-1.5 py-0.5 font-tomorrow font-bold uppercase tracking-widest bg-black/40">Ver</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {profile.products.filter((p: any) => p.available !== false).length > 4 && (
                  <button type="button" onClick={() => setFullCatalog('services')}
                    style={{ backgroundColor: accent }}
                    className="mt-4 w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest text-white shadow-lg transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-2">
                    ✂️ Ver todos los servicios
                  </button>
                )}
              </div>
            )}

            {/* 2.3 Productos (catálogo propio: profile.barber_products) */}
            {sectionOn('barber_products') && Array.isArray((profile as any).barber_products) &&
              (profile as any).barber_products.filter((p: any) => p.available !== false).length > 0 && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-black/40">
                <h3 className="text-sm font-bold uppercase tracking-wider font-tomorrow text-[#ffa35d] flex items-center mb-4">
                  <FaBoxOpen className="mr-2" /> Nuestros Productos
                </h3>
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  {(profile as any).barber_products.filter((p: any) => p.available !== false).map((prod: any) => (
                    <div
                      key={prod.id}
                      onClick={() => setSelectedService({ ...prod, __kind: 'product' })}
                      className="bg-white/5 rounded-xl border border-white/5 hover:border-[#ffa35d]/40 overflow-hidden shadow-lg hover:scale-[1.02] hover:bg-white/10 transition duration-300 flex flex-col cursor-pointer active:scale-95"
                    >
                      {prod.imageURL ? (
                        <div className="w-full aspect-square overflow-hidden relative">
                          <img src={prod.imageURL} alt={prod.name} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-full aspect-square bg-[#ffa35d]/8 flex items-center justify-center text-3xl text-[#ffa35d]/60">
                          <FaBoxOpen />
                        </div>
                      )}
                      <div className="p-3 flex-1 flex flex-col justify-between">
                        <div>
                          <h4 className="cnx-product-text font-bold text-xs text-[#ffefe5] font-tomorrow uppercase tracking-wider line-clamp-1">{prod.name}</h4>
                          {prod.shortDescription && <p className="text-[10px] text-[#ffefe5]/60 mt-1 line-clamp-2 leading-tight">{prod.shortDescription}</p>}
                        </div>
                        {prod.price && (
                          <div className="flex items-center justify-between mt-3">
                            <span className="text-xs font-black text-[#ffa35d] font-tomorrow italic">{prod.price}</span>
                            <span className="text-[9px] text-white/50 border border-white/20 rounded-md px-1.5 py-0.5 font-tomorrow font-bold uppercase tracking-widest bg-black/40">Ver</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {(profile as any).barber_products.filter((p: any) => p.available !== false).length > 4 && (
                  <button type="button" onClick={() => setFullCatalog('products')}
                    style={{ backgroundColor: accent }}
                    className="mt-4 w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest text-white shadow-lg transition-all hover:brightness-110 active:scale-95 flex items-center justify-center gap-2">
                    <FaBoxOpen /> Ver todos los productos
                  </button>
                )}
              </div>
            )}

            {/* 2.1 Galería Dinámica (PRO Extra 1) */}
            {sectionOn('gallery') && ((profile.galleryMode === 'albums' && Array.isArray((profile as any).albums) && (profile as any).albums.length > 0) ||
              (Array.isArray(profile.galleryImageURLs) && profile.galleryImageURLs.length > 0)) && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-black/40">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider font-tomorrow text-[#ffa35d] flex items-center">
                    🖼️ {profile.galleryTitle?.trim() || t('gallery') || 'GALERÍA DE TRABAJOS'}
                  </h3>
                  {selectedAlbum && (
                    <button
                      onClick={() => setSelectedAlbum(null)}
                      className="text-[10px] text-[#ffa35d] hover:underline uppercase font-tomorrow font-bold"
                    >
                      Volver a Álbumes
                    </button>
                  )}
                </div>

                {profile.galleryMode === 'albums' && Array.isArray((profile as any).albums) && (profile as any).albums.length > 0 ? (
                  selectedAlbum ? (
                    <div>
                      <p className="text-xs text-[#ffefe5]/60 mb-3 font-tomorrow uppercase tracking-wider">Álbum: {selectedAlbum.title}</p>
                      {Array.isArray(selectedAlbum.images) && selectedAlbum.images.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {selectedAlbum.images.map((imgUrl: string, idx: number) => (
                            <div
                              key={`${imgUrl}_${idx}`}
                              onClick={() => { setLightboxImages(selectedAlbum.images); setLightboxIndex(idx); }}
                              className="aspect-square relative overflow-hidden rounded-xl border border-white/5 hover:border-[#ffa35d]/50 group transition duration-300 shadow-md bg-black cursor-pointer"
                            >
                              <img
                                src={imgUrl}
                                alt={`Foto ${idx + 1}`}
                                className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-[#ffefe5]/40 py-6 text-center">Este álbum no tiene fotos aún.</p>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {(profile as any).albums.map((album: any) => (
                        <div
                          key={album.id}
                          onClick={() => setSelectedAlbum(album)}
                          className="bg-white/5 rounded-xl border border-white/5 hover:border-[#ffa35d]/40 overflow-hidden shadow-md group cursor-pointer hover:bg-white/10 transition duration-300"
                        >
                          <div className="aspect-video relative overflow-hidden bg-black">
                            {album.coverImage ? (
                              <img
                                src={album.coverImage}
                                alt={album.title}
                                className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-lg">📁</div>
                            )}
                          </div>
                          <div className="p-3">
                            <h4 className="font-bold text-xs text-[#ffefe5] font-tomorrow uppercase tracking-wider truncate">{album.title}</h4>
                            <p className="text-[10px] text-[#ffefe5]/50 mt-0.5">{Array.isArray(album.images) ? album.images.length : 0} fotos</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {profile.galleryImageURLs.map((imgUrl, index) => (
                      <div 
                        key={index} 
                        onClick={() => { setLightboxImages(profile.galleryImageURLs || []); setLightboxIndex(index); }}
                        className="aspect-square relative overflow-hidden rounded-xl border border-white/5 hover:border-[#ffa35d]/50 group transition duration-300 shadow-md bg-black cursor-pointer"
                      >
                        <img
                          src={imgUrl}
                          alt={`Galería ${index + 1}`}
                          className="w-full h-full object-cover group-hover:scale-110 transition duration-500"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Horarios */}
            {profile.showSchedule && Array.isArray(profile.businessHours) && profile.businessHours.length > 0 && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-black/40">
                <h3 className="text-sm font-bold uppercase tracking-wider font-tomorrow text-[#ffa35d] flex items-center mb-4">
                  <FaClock className="mr-2" /> {t('schedule_title') || 'Horarios de Atención'}
                </h3>
                <div className="space-y-2 font-tomorrow">
                  {profile.businessHours.map((day: any, index: number) => (
                    <div key={index} className="flex justify-between items-center text-xs py-1.5 border-b border-white/5 last:border-b-0">
                      <span className="capitalize font-bold text-[#ffefe5]/90 tracking-wide">{day.day}</span>
                      <span className={`font-black tracking-widest ${day.isOpen && day.openTime && day.closeTime ? 'text-[#ffa35d]' : 'text-white/40'}`}>
                        {day.isOpen && day.openTime && day.closeTime ? `${day.openTime} - ${day.closeTime}` : t('closed') || 'CERRADO'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}


            {/* Booking Calendar */}
            {profile.showCalendar && profile.calendarWebhookUrl && (
              <div className="glass-panel rounded-2xl p-5 border border-white/5 bg-black/40">
                <a href={profile.calendarWebhookUrl} target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all hover:scale-[1.02] active:scale-95"
                  style={{ backgroundColor: profile.buttonColor || '#ff6b35', color: profile.buttonTextColor || '#fff' }}>
                  📅 Agendar Cita
                </a>
              </div>
            )}

            {/* Testimonios */}
            {sectionOn('testimonials') && Array.isArray(profile.testimonials) && profile.testimonials.length > 0 && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-black/40">
                <h3 className="text-sm font-bold uppercase tracking-wider font-tomorrow text-[#ffa35d] flex items-center mb-4">
                  <FaStar className="mr-2 text-[#ffa35d]" /> {t('testimonials_title') || 'Reseñas de Clientes'}
                </h3>
                <div className="space-y-4">
                  {profile.testimonials.map((test) => (
                    <div key={test.id} className="bg-white/5 border border-white/5 rounded-xl p-4 shadow-md text-center">
                      <p className="cnx-testimonial-text italic text-xs text-[#ffefe5]/90 leading-relaxed">"{test.quote}"</p>
                      <div className="mt-3 flex items-center justify-center space-x-2">
                        {test.authorImageURL && (
                          <img
                            src={test.authorImageURL}
                            alt={test.author}
                            className="w-7 h-7 rounded-full object-cover border border-[#ffa35d]/40"
                          />
                        )}
                        <div className="text-left">
                          <p className="font-bold text-xs text-[#ffa35d] font-tomorrow uppercase tracking-wider">{test.author}</p>
                          {test.authorTitle && (
                            <p className="text-[10px] text-white/50">{test.authorTitle}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* 3. Capa ULTRA Sections */}
        {isUltra && (
          <>
            {/* Digital Files */}
            {Array.isArray(profile.digitalFiles) && profile.digitalFiles.length > 0 && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-black/40">
                <h3 className="text-sm font-bold uppercase tracking-wider font-tomorrow text-[#ffa35d] flex items-center mb-4">
                  <FaFolderOpen className="mr-2" /> {t('digital_files') || 'Descargas'}
                </h3>
                <div className="space-y-2">
                  {profile.digitalFiles.map((file: any) => (
                    <a
                      key={file.id}
                      href={file.fileURL || '#'}
                      download={file.fileName || undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-white/5 rounded-xl border border-white/5 hover:border-[#ffa35d]/20 hover:bg-white/10 transition text-xs"
                    >
                      <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-base shrink-0">📄</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs truncate text-[#ffefe5]">{file.title}</p>
                        <p className="text-[10px] text-white/50">{file.fileType?.toUpperCase()}</p>
                      </div>
                      <span className="text-[#ffa35d] font-bold">📥</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* FAQs */}
            {Array.isArray(profile.faqs) && profile.faqs.length > 0 && (
              <div className="glass-panel rounded-2xl p-6 border border-white/5 bg-black/40">
                <h3 className="text-sm font-bold uppercase tracking-wider font-tomorrow text-[#ffa35d] flex items-center mb-4">
                  <FaQuestionCircle className="mr-2" /> {t('faqs_title') || 'FAQs'}
                </h3>
                <div className="space-y-2">
                  {profile.faqs.map((faq: any, idx) => (
                    <div key={faq.id} className="border border-white/5 rounded-xl overflow-hidden bg-white/5">
                      <button
                        onClick={() => setOpenFaqIndex(openFaqIndex === idx ? null : idx)}
                        className="w-full flex items-center justify-between p-3.5 text-left hover:bg-white/10 transition text-xs font-bold"
                      >
                        <span className="text-[#ffefe5] pr-4">{faq.question}</span>
                        <span className="text-[#ffa35d]">{openFaqIndex === idx ? '▲' : '▼'}</span>
                      </button>
                      {openFaqIndex === idx && (
                        <div className="px-3.5 pb-3.5 text-[11px] leading-relaxed text-[#ffefe5]/80 border-t border-white/5 pt-2 whitespace-pre-line bg-black/20">
                          {faq.answer}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

      </div>

      {/* Secciones genéricas — galería, archivos y FAQs ya los renderiza el barber */}
      <ProfileExtraSections profile={profile} accent={accent} skip={['gallery', 'archives', 'faqs']} />

      {/* Footer */}
      <div className="w-full max-w-2xl mx-auto px-4 mt-12 text-center">
        {profile.logoURL && (
          <img
            src={profile.logoURL}
            alt="Logo"
            className="h-10 object-contain mx-auto opacity-80 mb-4"
          />
        )}
        <p className="text-[10px] text-white/30 tracking-widest font-tomorrow font-bold uppercase">
          Powered by Connexo
        </p>
      </div>

      </div> {/* Close cinema-animate-in */}

      {showClubModal && (
        <ClubBarberModal
          barberId={profile.id}
          isMobilePreview={isMobilePreview}
          onClose={() => setShowClubModal(false)}
        />
      )}

      {showReservationModal && (
        <BarberReservationModal
          profile={profile}
          staff={staffList}
          accent={accent}
          isMobilePreview={isMobilePreview}
          onClose={() => setShowReservationModal(false)}
        />
      )}

      {selectedService && (
        <BarberServiceModal
          service={selectedService}
          barberId={profile.id}
          gateways={(profile as any).barber_gateways}
          fallbackWhatsapp={profile.whatsapp || profile.phone}
          isMobilePreview={isMobilePreview}
          onClose={() => setSelectedService(null)}
        />
      )}

      {fullCatalog && (
        <FullCatalogView
          items={fullCatalog === 'services' ? serviceItems : productItems}
          onBack={() => setFullCatalog(null)}
          onSelect={(raw) => {
            const isProduct = fullCatalog === 'products';
            setFullCatalog(null);
            setSelectedService(isProduct ? { ...raw, __kind: 'product' } : raw);
          }}
          accent={accent}
          bg={profile?.backgroundColor || '#050505'}
          text="#ffefe5"
          fontFamily={profile?.fontFamily}
          title={fullCatalog === 'services' ? 'Nuestros Servicios' : 'Nuestros Productos'}
          searchPlaceholder="Buscar por nombre o categoría"
          ctaLabel="Ver →"
          isMobilePreview={isMobilePreview}
        />
      )}

      {/* Local Lightbox Modal */}
      {lightboxIndex >= 0 && lightboxImages.length > 0 && (
        <div 
          className="fixed inset-0 bg-black/95 flex items-center justify-center z-[10000] p-4"
          onClick={() => setLightboxIndex(-1)}
        >
          <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxIndex(-1)}
              className="absolute top-4 right-4 text-white bg-black/60 rounded-full w-8 h-8 flex items-center justify-center hover:bg-black/80 transition border border-white/20"
            >
              ✕
            </button>
            {lightboxImages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(prev => prev === 0 ? lightboxImages.length - 1 : prev - 1);
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-white bg-black/60 rounded-full w-12 h-12 flex items-center justify-center hover:bg-black/80 transition border border-white/20 text-xl font-bold"
              >
                ‹
              </button>
            )}
            {lightboxImages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(prev => prev === lightboxImages.length - 1 ? 0 : prev + 1);
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-white bg-black/60 rounded-full w-12 h-12 flex items-center justify-center hover:bg-black/80 transition border border-white/20 text-xl font-bold"
              >
                ›
              </button>
            )}
            <img
              src={lightboxImages[lightboxIndex]}
              alt={`Imagen ${lightboxIndex + 1}`}
              className="max-w-full max-h-[90vh] object-contain rounded-lg border border-white/10"
            />
            {lightboxImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white bg-black/60 px-4 py-1.5 rounded-full text-xs font-tomorrow">
                {lightboxIndex + 1} / {lightboxImages.length}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

// ─── BarberMembershipLookup ────────────────────────────────────────────────
interface BarberMembershipLookupProps {
  barberId: string;
  isMobilePreview?: boolean;
  onJoinClick: () => void;
  stampsReward?: string;
}

const BarberMembershipLookup: React.FC<BarberMembershipLookupProps> = ({
  barberId, isMobilePreview, onJoinClick, stampsReward,
}) => {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleLookup = async () => {
    if (!query.trim() || isMobilePreview) return;
    setLoading(true);
    setSearched(false);
    const { data, error } = await supabase.rpc('get_barber_member', {
      p_barber_id: barberId,
      p_identifier: query.trim(),
    });
    setLoading(false);
    setSearched(true);
    setResult(error ? null : data);
  };

  const stamps = result?.stamps ?? 0;

  return (
    <div className="rounded-2xl border border-[#ffa35d]/15 bg-[#0f0702]/80 p-4 space-y-3">
      <p className="text-[11px] font-tomorrow uppercase tracking-widest text-[#ffa35d]/70 font-bold">
        💈 Consultar mi tarjeta
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSearched(false); setResult(null); }}
          onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
          placeholder="Email, teléfono o código B-XXXX"
          className="flex-1 bg-black/40 border border-[#ffa35d]/20 rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
        />
        <button
          onClick={handleLookup}
          disabled={loading || !query.trim()}
          className="px-4 py-2.5 rounded-xl bg-[var(--cnx-accent)] text-black text-xs font-black font-tomorrow uppercase tracking-wide active:scale-95 transition-all disabled:opacity-40"
        >
          {loading ? '...' : 'Ver'}
        </button>
      </div>
      {searched && result?.found === false && (
        <div className="text-center py-3 space-y-2">
          <p className="text-xs text-[#ffefe5]/50">No encontramos tu cuenta.</p>
          <button onClick={onJoinClick} className="text-xs text-[#ffa35d] underline underline-offset-2">
            ¿Quieres unirte al Club Barber?
          </button>
        </div>
      )}
      {result?.found && (
        <div className="rounded-xl bg-gradient-to-br from-[#1a0800] to-black border border-[#ffa35d]/20 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="font-tomorrow font-black text-white text-sm">{result.name}</span>
            <div className="flex items-center gap-2">
              {result.is_vip && (
                <span className="text-[10px] font-black bg-[#ffa35d]/20 text-[#ffa35d] px-2 py-0.5 rounded-full font-tomorrow uppercase tracking-wider">
                  ⭐ VIP
                </span>
              )}
              <span className="text-[10px] text-[#ffefe5]/40 font-mono tracking-widest">{result.member_code}</span>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-4 text-center">
            <div>
              <p className="text-lg font-black text-[#ffa35d]">{result.visits}</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Visitas</p>
            </div>
            {result.discount_percent > 0 && (
              <div>
                <p className="text-lg font-black text-green-400">{result.discount_percent}%</p>
                <p className="text-[10px] text-white/40 uppercase tracking-wider">Descuento</p>
              </div>
            )}
            <div>
              <p className="text-lg font-black text-[#ffa35d]">{stamps}/10</p>
              <p className="text-[10px] text-white/40 uppercase tracking-wider">Sellos</p>
            </div>
          </div>

          {/* Stamps progress */}
          <div className="space-y-1.5">
            <div className="flex gap-1 justify-center">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i} className={`text-base leading-none ${i < stamps ? 'text-[#ffa35d]' : 'text-white/15'}`}>★</span>
              ))}
            </div>
            {stamps >= 10 ? (
              <p className="text-center text-xs text-[#ffa35d] font-black">🎉 ¡Completaste tus 10 sellos!</p>
            ) : (
              <p className="text-center text-[11px] text-white/35">{10 - stamps} sello{10 - stamps !== 1 ? 's' : ''} para tu recompensa</p>
            )}
            {stampsReward && (
              <p className="text-center text-[11px] text-[#ffa35d]/70 border-t border-white/5 pt-2">
                🎁 <span className="font-bold">{stampsReward}</span>
              </p>
            )}
          </div>

          {/* Benefits */}
          {result.benefits && (
            <p className="text-[11px] text-[#ffefe5]/60 leading-relaxed border-t border-white/5 pt-2">{result.benefits}</p>
          )}
        </div>
      )}
    </div>
  );
};

// ─── ClubBarberModal ──────────────────────────────────────────────────────
interface ClubBarberModalProps {
  barberId: string;
  isMobilePreview?: boolean;
  onClose: () => void;
}

const ClubBarberModal: React.FC<ClubBarberModalProps> = ({ barberId, isMobilePreview, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!name.trim() || !email.trim()) { setError('Nombre y email son requeridos.'); return; }
    if (isMobilePreview) { setError('Desactivado en vista previa.'); return; }
    setLoading(true);
    setError('');
    const { data, error: rpcError } = await supabase.rpc('join_barber_club', {
      p_barber_id: barberId,
      p_name: name.trim(),
      p_email: email.trim(),
      p_phone: phone.trim() || null,
    });
    setLoading(false);
    if (rpcError) { setError('Ocurrió un error. Intenta de nuevo.'); return; }
    setResult(data);
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0f0702] border border-[#ffa35d]/20 w-full max-w-sm rounded-2xl shadow-2xl relative text-white overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative p-6 pb-4 border-b border-white/5">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition">
            <FaTimes />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ffa35d]/15 flex items-center justify-center text-xl">💈</div>
            <div>
              <h3 className="font-black font-tomorrow text-[#ffa35d] uppercase tracking-wider text-sm">Club Barber</h3>
              <p className="text-[11px] text-white/40">Descuentos y beneficios exclusivos</p>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {!result ? (
            <>
              <div className="space-y-3">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre *"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Tu email *"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Teléfono (opcional)"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold font-tomorrow uppercase tracking-widest active:scale-95 transition-all"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading || !name.trim() || !email.trim()}
                  className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[var(--cnx-accent)] to-[#ffa35d] text-black text-xs font-black font-tomorrow uppercase tracking-widest active:scale-95 disabled:opacity-40 transition-all"
                >
                  {loading ? 'Registrando...' : 'Unirme'}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center space-y-4 py-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-[#ffa35d]/15 flex items-center justify-center text-3xl">
                {result.already_member ? '💈' : '🎉'}
              </div>
              <div>
                <h4 className="font-black font-tomorrow text-white text-base">
                  {result.already_member ? '¡Bienvenido de vuelta!' : '¡Ahora eres miembro!'}
                </h4>
                <p className="text-xs text-white/50 mt-1">
                  {result.already_member
                    ? `Ya eres parte del club, ${result.name?.split(' ')[0]}.`
                    : `Hola ${result.name?.split(' ')[0]}, tu membresía está lista.`}
                </p>
              </div>

              {/* Código prominente */}
              <div className="bg-black/60 rounded-2xl px-6 py-5 border border-[#ffa35d]/30 text-center">
                <p className="text-[10px] text-[#ffa35d]/60 uppercase tracking-[3px] font-tomorrow mb-2">Tu código único</p>
                <p className="text-4xl font-black font-tomorrow text-[#ffa35d] tracking-[6px] mb-1">{result.member_code}</p>
                <div className="mt-3 text-left"><MemberPlanBadge ownerId={barberId} identifier={result.member_code} system="barber" accent="#ffa35d" /></div>
                <p className="text-[10px] text-white/30 leading-relaxed">
                  Este código es único e intransferible.
                </p>
              </div>

              {/* Instrucciones */}
              <div className="bg-[#ffa35d]/5 border border-[#ffa35d]/15 rounded-xl px-4 py-3 text-left space-y-1">
                <p className="text-[11px] text-[#ffa35d]/80 font-bold">¿Cómo usarlo?</p>
                <p className="text-[11px] text-white/50 leading-relaxed">
                  Muéstralo en cada visita para acumular sellos y acceder a tus beneficios exclusivos. Al llegar a 10 sellos, desbloqueas tu recompensa.
                </p>
              </div>

              {result.discount_percent > 0 && (
                <p className="text-xs text-center text-green-400">🎁 Tienes <strong>{result.discount_percent}%</strong> de descuento activo.</p>
              )}

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-[var(--cnx-accent)] text-black font-black text-sm font-tomorrow uppercase tracking-wider active:scale-95 transition-all"
              >
                ¡Perfecto!
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── BarberServiceModal ───────────────────────────────────────────────────
interface BarberServiceModalProps {
  service: any;
  barberId: string;
  gateways?: BarberPaymentGatewaysConfig;
  fallbackWhatsapp?: string;
  isMobilePreview?: boolean;
  onClose: () => void;
}

const BarberServiceModal: React.FC<BarberServiceModalProps> = ({ service, barberId, gateways, fallbackWhatsapp, isMobilePreview, onClose }) => {
  const [code, setCode] = useState('');
  const [member, setMember] = useState<any>(null);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [payMethod, setPayMethod] = useState<BarberPaymentMethodType | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [payError, setPayError] = useState('');
  const [copied, setCopied] = useState(false);

  const { processPayment, enabledMethods } = useBarberPayment(gateways, barberId);
  const isProduct = service.__kind === 'product';

  const checkCode = async () => {
    if (!code.trim() || isMobilePreview) return;
    setChecking(true);
    const { data } = await supabase.rpc('get_barber_member', {
      p_barber_id: barberId,
      p_identifier: code.trim(),
    });
    setChecking(false);
    setChecked(true);
    setMember(data?.found ? data : null);
  };

  const numericPrice = service.price
    ? parseFloat(String(service.price).replace(/[^0-9.]/g, ''))
    : null;
  const discount = member?.discount_percent ?? 0;
  const finalPrice = numericPrice != null && discount > 0
    ? (numericPrice * (1 - discount / 100)).toFixed(2)
    : null;
  const currency = service.price ? String(service.price).replace(/[0-9.,]/g, '').trim() || '$' : '$';
  const amount = finalPrice ? Number(finalPrice) : (numericPrice ?? 0);

  const bank = (gateways as any)?.bank_transfer;
  // Fallback: si el dueño no configuró pasarelas, el cliente aún puede escribir al WhatsApp del perfil.
  const fallbackWa = barberWaNumber(fallbackWhatsapp);

  const methodLabels: Record<BarberPaymentMethodType, { icon: React.ReactNode; label: string }> = {
    direct_link: { icon: <FaLink />, label: (gateways as any)?.direct_link?.label?.trim() || 'Pagar con tarjeta' },
    payphone: { icon: <FaMobileAlt />, label: 'PayPhone' },
    bank_transfer: { icon: <FaUniversity />, label: 'Transferencia bancaria' },
    whatsapp_manual: { icon: <FaWhatsapp />, label: 'Pedir por WhatsApp' },
  };

  const handlePay = async (method: BarberPaymentMethodType) => {
    if (isMobilePreview) return;
    setPayError('');
    // Transferencia: no navega a ningún lado, solo despliega los datos de la cuenta.
    if (method === 'bank_transfer') { setPayMethod(method); return; }
    setPayBusy(true);
    try {
      await processPayment(method, {
        amount,
        currency,
        orderId: member?.member_code || undefined,
        customerDetails: member ? { name: member.name, email: member.email, phone: member.phone } : undefined,
        items: [{ name: service.name, quantity: 1, price: amount }],
      });
      setPayMethod(method);
    } catch (err: any) {
      setPayError(err?.message || 'No pudimos iniciar el pago. Intenta con otro método.');
    } finally {
      setPayBusy(false);
    }
  };

  const sendVoucher = () => {
    if (isMobilePreview) return;
    const phone = barberWaNumber((gateways as any)?.whatsapp_manual?.phone) || fallbackWa;
    if (!phone) return;
    const text = encodeURIComponent(
      `¡Hola! Adjunto el comprobante de mi ${isProduct ? 'compra' : 'servicio'}: ${service.name} — ${currency}${amount.toFixed(2)}`
    );
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank', 'noopener');
  };

  const copyAccount = async () => {
    if (!bank?.account_number) return;
    try {
      await navigator.clipboard.writeText(String(bank.account_number));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard bloqueado: el número está visible igual */ }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#0f0702] border border-[#ffa35d]/20 w-full max-w-sm rounded-2xl shadow-2xl text-white overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Service image */}
        {service.imageURL && (
          <div className="w-full h-48 overflow-hidden relative">
            <img src={service.imageURL} alt={service.name} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#0f0702] via-transparent to-transparent" />
          </div>
        )}

        <div className="p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              {service.category && (
                <p className="text-[10px] text-[#ffa35d]/60 uppercase tracking-widest font-tomorrow font-bold mb-1">{service.category}</p>
              )}
              <h3 className="font-black font-tomorrow text-white text-lg leading-tight">{service.name}</h3>
              {service.shortDescription && (
                <p className="text-xs text-white/50 mt-1 leading-relaxed">{service.shortDescription}</p>
              )}
            </div>
            <button onClick={onClose} className="text-white/40 hover:text-white transition shrink-0 mt-0.5"><FaTimes /></button>
          </div>

          {/* Price display */}
          {service.price && (
            <div className="bg-black/40 rounded-xl p-4 border border-white/5 flex items-center justify-between">
              <div>
                {finalPrice && (
                  <p className="text-[11px] text-white/40 line-through">{service.price}</p>
                )}
                <p className={`text-2xl font-black font-tomorrow ${finalPrice ? 'text-green-400' : 'text-[#ffa35d]'}`}>
                  {finalPrice ? `${currency}${finalPrice}` : service.price}
                </p>
                {finalPrice && (
                  <p className="text-[10px] text-green-400 mt-0.5">{discount}% descuento aplicado ✓</p>
                )}
              </div>
              {member?.is_vip && (
                <span className="text-[10px] bg-[#ffa35d]/20 text-[#ffa35d] px-2 py-1 rounded-full font-black uppercase tracking-wider">⭐ VIP</span>
              )}
            </div>
          )}

          {/* Member code input */}
          {!member && (
            <div className="space-y-2">
              <p className="text-[11px] text-white/40">¿Tienes código de miembro? Ingresa tu código para aplicar tu descuento.</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={code}
                  onChange={e => { setCode(e.target.value); setChecked(false); setMember(null); }}
                  onKeyDown={e => e.key === 'Enter' && checkCode()}
                  placeholder="Código, email o teléfono"
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50"
                />
                <button
                  onClick={checkCode}
                  disabled={checking || !code.trim()}
                  className="px-4 py-2.5 rounded-xl bg-[var(--cnx-accent)] text-black text-xs font-black font-tomorrow uppercase active:scale-95 transition-all disabled:opacity-40"
                >
                  {checking ? '...' : 'OK'}
                </button>
              </div>
              {checked && !member && (
                <p className="text-xs text-red-400/70">No encontramos ese código. El precio regular aplica.</p>
              )}
            </div>
          )}

          {/* Benefits */}
          {member?.benefits && (
            <div className="bg-[#ffa35d]/5 border border-[#ffa35d]/15 rounded-xl px-4 py-3">
              <p className="text-[10px] text-[#ffa35d]/70 uppercase tracking-widest font-bold mb-1">Tus beneficios</p>
              <p className="text-xs text-white/60 leading-relaxed">{member.benefits}</p>
            </div>
          )}

          {/* Métodos de pago (solo los activados por el dueño) */}
          {enabledMethods.length > 0 && amount > 0 && (
            <div className="space-y-2 pt-1">
              <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">
                {isProduct ? 'Comprar ahora' : 'Reservar y pagar'}
              </p>
              {enabledMethods.map(m => (
                <button
                  key={m}
                  onClick={() => handlePay(m)}
                  disabled={payBusy}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all active:scale-[0.98] disabled:opacity-50 ${
                    payMethod === m
                      ? 'bg-[#ffa35d]/10 border-[#ffa35d]/40'
                      : 'bg-white/5 border-white/10 hover:border-[#ffa35d]/40'
                  } ${m === 'whatsapp_manual' ? 'text-green-400' : 'text-[#ffa35d]'}`}
                >
                  <span className="text-base shrink-0">{methodLabels[m].icon}</span>
                  <span className="flex-1 text-xs font-black font-tomorrow uppercase tracking-wider text-white">
                    {methodLabels[m].label}
                  </span>
                  <span className="text-xs font-black">{currency}{amount.toFixed(2)}</span>
                </button>
              ))}

              {payError && <p className="text-[11px] text-red-400/80 leading-relaxed">{payError}</p>}

              {/* Transferencia: datos de la cuenta + envío de comprobante */}
              {payMethod === 'bank_transfer' && bank && (
                <div className="bg-black/40 border border-[#ffa35d]/15 rounded-xl p-4 space-y-2">
                  <p className="text-[10px] text-[#ffa35d]/70 uppercase tracking-widest font-bold">Datos para la transferencia</p>
                  {bank.bank_name && <p className="text-xs text-white/70"><span className="text-white/40">Banco:</span> {bank.bank_name}</p>}
                  {bank.account_type && <p className="text-xs text-white/70"><span className="text-white/40">Tipo:</span> {bank.account_type}</p>}
                  {bank.account_number && (
                    <button onClick={copyAccount} className="w-full flex items-center justify-between gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-left hover:border-[#ffa35d]/40 transition">
                      <span className="text-xs text-white font-mono">{bank.account_number}</span>
                      <span className="text-[10px] text-[#ffa35d] flex items-center gap-1 shrink-0">
                        <FaCopy /> {copied ? '¡Copiado!' : 'Copiar'}
                      </span>
                    </button>
                  )}
                  {bank.holder && <p className="text-xs text-white/70"><span className="text-white/40">Titular:</span> {bank.holder}</p>}
                  {bank.id_number && <p className="text-xs text-white/70"><span className="text-white/40">Cédula/RUC:</span> {bank.id_number}</p>}
                  {bank.email && <p className="text-xs text-white/70 break-all"><span className="text-white/40">Email:</span> {bank.email}</p>}
                  <button
                    onClick={sendVoucher}
                    className="w-full mt-2 py-2.5 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <FaWhatsapp /> Enviar comprobante
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Sin pasarelas configuradas: el WhatsApp del perfil sigue siendo la salida */}
          {enabledMethods.length === 0 && fallbackWa && (
            <a
              href={`https://wa.me/${fallbackWa}?text=${encodeURIComponent(`¡Hola! Me interesa: ${service.name}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-green-500/15 border border-green-500/30 text-green-400 font-black text-xs font-tomorrow uppercase tracking-wider active:scale-95 transition-all"
            >
              <FaWhatsapp /> Consultar por WhatsApp
            </a>
          )}

          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-[var(--cnx-accent)] to-[#ffa35d] text-black font-black text-sm font-tomorrow uppercase tracking-wider active:scale-95 transition-all"
          >
            ¡Entendido!
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── BarberReservationModal ───────────────────────────────────────────────
// Agenda una cita: servicio → barbero → fecha/hora (según el horario propio del
// barbero, sin choques) → datos del cliente. Motor barber_* (place_barber_reservation).
interface BarberReservationModalProps {
  profile: Profile;
  staff: any[];
  accent: string;
  isMobilePreview?: boolean;
  onClose: () => void;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const genSlots = (openTime: string, closeTime: string): string[] => {
  const [oh, om] = (openTime || '09:00').split(':').map(Number);
  const [ch, cm] = (closeTime || '18:00').split(':').map(Number);
  let cur = oh * 60 + om;
  const end = ch * 60 + cm;
  const out: string[] = [];
  while (cur < end) { out.push(`${pad2(Math.floor(cur / 60))}:${pad2(cur % 60)}`); cur += 30; }
  return out;
};

const BarberReservationModal: React.FC<BarberReservationModalProps> = ({ profile, staff, accent, isMobilePreview, onClose }) => {
  const services = Array.isArray(profile.products) ? profile.products.filter((p: any) => p.available !== false) : [];

  const [serviceName, setServiceName] = useState<string>('');
  const [selStaff, setSelStaff] = useState<any | null>(staff.length === 1 ? staff[0] : null);
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [taken, setTaken] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [memberCode, setMemberCode] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const todayStr = new Date().toISOString().slice(0, 10);
  const maxDate = (() => { const d = new Date(); d.setDate(d.getDate() + 60); return d.toISOString().slice(0, 10); })();

  // Horario del barbero para el día elegido
  const dayHours = React.useMemo(() => {
    if (!selStaff || !date) return null;
    const dow = new Date(date + 'T00:00:00').getDay();
    const hrs = Array.isArray(selStaff.working_hours) ? selStaff.working_hours : [];
    return hrs.find((h: any) => h.day === dow) || null;
  }, [selStaff, date]);

  // Franjas disponibles = generadas - tomadas - pasadas (si es hoy)
  const slots = React.useMemo(() => {
    if (!dayHours || !dayHours.isOpen) return [];
    let all = genSlots(dayHours.openTime, dayHours.closeTime).filter(s => !taken.includes(s));
    if (date === todayStr) {
      const now = new Date();
      const cur = `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
      all = all.filter(s => s > cur);
    }
    return all;
  }, [dayHours, taken, date, todayStr]);

  // Cargar franjas tomadas al elegir barbero + fecha
  useEffect(() => {
    setTime('');
    if (!selStaff || !date) { setTaken([]); return; }
    let cancelled = false;
    setLoadingSlots(true);
    supabase.rpc('get_barber_staff_availability', { p_barber_id: profile.id, p_staff_id: selStaff.id, p_date: date })
      .then(({ data }) => {
        if (cancelled) return;
        const t = data?.taken;
        setTaken(Array.isArray(t) ? t : []);
      })
      .then(() => { if (!cancelled) setLoadingSlots(false); });
    return () => { cancelled = true; };
  }, [selStaff, date, profile.id]);

  const canSubmit = selStaff && date && time && name.trim();

  const handleSubmit = async () => {
    if (!canSubmit) { setError('Elige barbero, fecha, hora y tu nombre.'); return; }
    if (isMobilePreview) { setError('Desactivado en vista previa.'); return; }
    setSubmitting(true);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('place_barber_reservation', {
        p_barber_id: profile.id,
        p_staff_id: selStaff.id,
        p_service: serviceName || null,
        p_name: name.trim(),
        p_phone: phone.trim() || null,
        p_email: email.trim() || null,
        p_date: date,
        p_time: time,
        p_notes: notes.trim() || null,
        p_member_code: memberCode.trim() || null,
      });
      if (rpcError) { setError('No pudimos agendar. Intenta de nuevo.'); return; }
      if (!data?.ok) {
        setError(
          data?.error === 'slot_taken' ? 'Esa hora se acaba de ocupar. Elige otra.'
          : data?.error === 'staff_unavailable' ? 'Ese barbero ya no está disponible.'
          : 'No pudimos agendar. Revisa los datos.'
        );
        // refrescar franjas por si otra persona tomó la hora
        setTime('');
        return;
      }
      setResult(data);
    } catch {
      setError('Ocurrió un error. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls = "w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50";

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f0702] border border-[#ffa35d]/20 w-full max-w-md rounded-2xl shadow-2xl relative text-white overflow-hidden max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="relative p-6 pb-4 border-b border-white/5 shrink-0">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/40 hover:text-white transition"><FaTimes /></button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#ffa35d]/15 flex items-center justify-center text-xl">📅</div>
            <div>
              <h3 className="font-black font-tomorrow text-[#ffa35d] uppercase tracking-wider text-sm">Reservar una cita</h3>
              <p className="text-[11px] text-white/40">Elige servicio, barbero y hora</p>
            </div>
          </div>
        </div>

        {result ? (
          <div className="p-6 text-center space-y-4 overflow-y-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-[#ffa35d]/15 flex items-center justify-center text-3xl">✅</div>
            <div>
              <h4 className="font-black font-tomorrow text-white text-base">¡Cita agendada!</h4>
              <p className="text-xs text-white/50 mt-1">Te esperamos, {name.split(' ')[0]}.</p>
            </div>
            <div className="bg-black/60 rounded-2xl px-6 py-5 border border-[#ffa35d]/30 text-center">
              <p className="text-[10px] text-[#ffa35d]/60 uppercase tracking-[3px] font-tomorrow mb-2">Tu código de cita</p>
              <p className="text-3xl font-black font-tomorrow text-[#ffa35d] tracking-[4px] mb-1">{result.confirmation_code}</p>
              <p className="text-[10px] text-white/30 leading-relaxed">Guárdalo para consultar el estado de tu cita.</p>
            </div>
            <div className="bg-[#ffa35d]/5 border border-[#ffa35d]/15 rounded-xl px-4 py-3 text-left text-xs text-white/70 space-y-1">
              {result.staff_name && <p><span className="text-white/40">Barbero:</span> {result.staff_name}</p>}
              <p><span className="text-white/40">Fecha:</span> {new Date(date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long' })}</p>
              <p><span className="text-white/40">Hora:</span> {time}</p>
              {serviceName && <p><span className="text-white/40">Servicio:</span> {serviceName}</p>}
            </div>
            <button onClick={onClose} className="w-full py-3 rounded-xl bg-[var(--cnx-accent)] text-black font-black text-sm font-tomorrow uppercase tracking-wider active:scale-95 transition-all">
              ¡Perfecto!
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4 overflow-y-auto">
            {/* Servicio */}
            {services.length > 0 && (
              <div>
                <label className="block text-[10px] text-[#ffa35d]/70 uppercase tracking-widest font-bold mb-2">Servicio</label>
                <div className="flex flex-wrap gap-2">
                  {services.map((s: any) => (
                    <button key={s.id} onClick={() => setServiceName(s.name)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${serviceName === s.name ? 'bg-[#ffa35d] text-black border-[#ffa35d]' : 'bg-white/5 text-white/70 border-white/10 hover:border-[#ffa35d]/40'}`}>
                      {s.name}{s.price ? ` · ${s.price}` : ''}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Barbero */}
            <div>
              <label className="block text-[10px] text-[#ffa35d]/70 uppercase tracking-widest font-bold mb-2">Elige tu barbero</label>
              <div className="grid grid-cols-3 gap-2">
                {staff.map(st => (
                  <button key={st.id} onClick={() => setSelStaff(st)}
                    className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition ${selStaff?.id === st.id ? 'bg-[#ffa35d]/10 border-[#ffa35d]/50' : 'bg-white/5 border-white/10 hover:border-[#ffa35d]/30'}`}>
                    {st.photo_url ? (
                      <img src={st.photo_url} alt={st.name} className="w-12 h-12 rounded-full object-cover border border-white/10" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-[#ffa35d]/10 flex items-center justify-center text-[#ffa35d]"><FaUserTie /></div>
                    )}
                    <span className="text-[10px] font-bold text-white text-center leading-tight line-clamp-1">{st.name}</span>
                    {st.role && <span className="text-[8px] text-white/40 text-center leading-tight line-clamp-1">{st.role}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha */}
            <div>
              <label className="block text-[10px] text-[#ffa35d]/70 uppercase tracking-widest font-bold mb-2">Fecha</label>
              <input type="date" value={date} min={todayStr} max={maxDate} onChange={e => setDate(e.target.value)}
                className={inputCls} disabled={!selStaff} />
            </div>

            {/* Horas */}
            {selStaff && date && (
              <div>
                <label className="block text-[10px] text-[#ffa35d]/70 uppercase tracking-widest font-bold mb-2">Hora disponible</label>
                {loadingSlots ? (
                  <p className="text-xs text-white/40 py-3 text-center">Buscando disponibilidad...</p>
                ) : !dayHours || !dayHours.isOpen ? (
                  <p className="text-xs text-white/40 py-3 text-center bg-white/5 rounded-xl border border-white/10">
                    {selStaff.name} no atiende ese día. Elige otra fecha.
                  </p>
                ) : slots.length === 0 ? (
                  <p className="text-xs text-white/40 py-3 text-center bg-white/5 rounded-xl border border-white/10">
                    No quedan horas libres ese día. Prueba con otra fecha.
                  </p>
                ) : (
                  <div className="grid grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {slots.map(s => (
                      <button key={s} onClick={() => setTime(s)}
                        className={`py-2 rounded-lg text-xs font-bold border transition ${time === s ? 'bg-[#ffa35d] text-black border-[#ffa35d]' : 'bg-white/5 text-white/70 border-white/10 hover:border-[#ffa35d]/40'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Datos del cliente */}
            <div className="space-y-3 pt-1">
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Tu nombre *" className={inputCls} />
              <div className="grid grid-cols-2 gap-3">
                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Teléfono" className={inputCls} />
                <input value={memberCode} onChange={e => setMemberCode(e.target.value)} placeholder="Código B-XXXX" className={inputCls} />
              </div>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email (opcional)" className={inputCls} />
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notas (opcional)" rows={2} className={`${inputCls} resize-none`} />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-xs font-bold font-tomorrow uppercase tracking-widest active:scale-95 transition-all">
                Cancelar
              </button>
              <button onClick={handleSubmit} disabled={submitting || !canSubmit}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-[var(--cnx-accent)] to-[#ffa35d] text-black text-xs font-black font-tomorrow uppercase tracking-widest active:scale-95 disabled:opacity-40 transition-all">
                {submitting ? 'Agendando...' : 'Confirmar cita'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── BarberReservationLookup ──────────────────────────────────────────────
// Consulta el estado de una cita por su código (get_barber_reservation_status).
const BarberReservationLookup: React.FC<{ barberId: string; isMobilePreview?: boolean }> = ({ barberId, isMobilePreview }) => {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [searched, setSearched] = useState(false);

  const STATUS_LABEL: Record<string, string> = {
    pendiente: 'Pendiente de confirmar',
    confirmada: 'Confirmada ✓',
    completada: 'Atendida',
    cancelada: 'Cancelada',
    no_show: 'No asististe',
  };

  const lookup = async () => {
    if (!code.trim() || isMobilePreview) return;
    setLoading(true);
    setSearched(false);
    const { data, error } = await supabase.rpc('get_barber_reservation_status', {
      p_barber_id: barberId,
      p_code: code.trim(),
    });
    setLoading(false);
    setSearched(true);
    setResult(error ? null : data);
  };

  return (
    <div className="rounded-2xl border border-[#ffa35d]/15 bg-[#0f0702]/80 p-4 space-y-3">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <span className="text-[11px] font-tomorrow uppercase tracking-widest text-[#ffa35d]/70 font-bold flex items-center gap-2">
          <FaCalendarAlt /> ¿Ya tienes una cita? Consúltala
        </span>
        <FaChevronDown className={`text-[#ffa35d] w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="flex gap-2">
            <input type="text" value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setSearched(false); setResult(null); }}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              placeholder="Código de tu cita"
              className="flex-1 bg-black/40 border border-[#ffa35d]/20 rounded-xl px-3 py-2.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-[#ffa35d]/50" />
            <button onClick={lookup} disabled={loading || !code.trim()}
              className="px-4 py-2.5 rounded-xl bg-[var(--cnx-accent)] text-black text-xs font-black font-tomorrow uppercase tracking-wide active:scale-95 transition-all disabled:opacity-40">
              {loading ? '...' : 'Ver'}
            </button>
          </div>

          {searched && result?.found === false && (
            <p className="text-xs text-[#ffefe5]/50 text-center py-2">No encontramos una cita con ese código.</p>
          )}
          {result?.found && (
            <div className="rounded-xl bg-gradient-to-br from-[#1a0800] to-black border border-[#ffa35d]/20 p-4 space-y-1.5">
              <p className="text-sm font-black text-[#ffa35d] font-tomorrow">{STATUS_LABEL[result.status] || result.status}</p>
              <p className="text-xs text-white/70"><span className="text-white/40">Fecha:</span> {new Date(result.reservation_date + 'T00:00:00').toLocaleDateString('es-EC', { weekday: 'long', day: '2-digit', month: 'long' })} · {result.reservation_time}</p>
              {result.staff_name && <p className="text-xs text-white/70"><span className="text-white/40">Barbero:</span> {result.staff_name}</p>}
              {result.service_name && <p className="text-xs text-white/70"><span className="text-white/40">Servicio:</span> {result.service_name}</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
};
