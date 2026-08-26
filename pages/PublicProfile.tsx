import React, { useState, useEffect, useRef } from 'react';
import { SubscriptionPricePicker } from '../components/SubscriptionPricePicker';
import { isSubscription } from '../src/lib/memberPlans';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getProfile, getLinks, generateVCard, getContactInfo, getAppearanceSettings } from '../services/mockData';
import type { Profile, UserLink, ContactInfo, WeekHours, AppearanceSettings, SectionOrder } from '../types';
import { Button } from '../components/ui';
import { ContactCaptureModal } from '../components/ContactCaptureModal';
import FullCatalogView from '../components/FullCatalogView';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { FaWhatsapp, FaEnvelope, FaShareAlt, FaPhoneAlt, FaMapMarkerAlt, FaTimes, FaChevronLeft, FaChevronRight, FaQrcode } from 'react-icons/fa';
import { QRCodeCanvas } from 'qrcode.react';
import { supabase } from '../src/lib/supabase';
import { trackProfileView as recordProfileView, trackLinkClick as recordLinkClick } from '../src/lib/analytics';
// Plantillas cargadas bajo demanda: cada perfil solo descarga el chunk de su theme
const ProfileBarberTemplate = React.lazy(() => import('../components/ProfileBarberTemplate').then(m => ({ default: m.ProfileBarberTemplate })));
const ProfileGastroTemplate = React.lazy(() => import('../components/ProfileGastroTemplate').then(m => ({ default: m.ProfileGastroTemplate })));
const ProfilePetcareTemplate = React.lazy(() => import('../components/ProfilePetcareTemplate').then(m => ({ default: m.ProfilePetcareTemplate })));
const ProfileMedicalTemplate = React.lazy(() => import('../components/ProfileMedicalTemplate').then(m => ({ default: m.ProfileMedicalTemplate })));
const ProfileEcomTemplate = React.lazy(() => import('../components/ProfileEcomTemplate').then(m => ({ default: m.ProfileEcomTemplate })));
const ProfileStageTemplate = React.lazy(() => import('../components/ProfileStageTemplate').then(m => ({ default: m.ProfileStageTemplate })));
const ProfileRealtyTemplate = React.lazy(() => import('../components/ProfileRealtyTemplate').then(m => ({ default: m.ProfileRealtyTemplate })));
const ProfileSublimaTemplate = React.lazy(() => import('../components/ProfileSublimaTemplate').then(m => ({ default: m.ProfileSublimaTemplate })));

const TemplateFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-white/40"></div>
  </div>
);



const VideoLinkCard: React.FC<{ href: string; thumbnailURL?: string; isVertical: boolean }> = ({ href, thumbnailURL, isVertical }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" style={{
    display: 'block', textDecoration: 'none', position: 'relative',
    borderRadius: '16px', overflow: 'hidden',
    aspectRatio: isVertical ? '9/16' : '16/9',
    background: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.1)'
  }}>
    {thumbnailURL && (
      <img src={thumbnailURL} alt="Video" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
    )}
    <div style={{
      position: 'absolute', inset: 0,
      background: thumbnailURL
        ? 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 60%)'
        : 'linear-gradient(135deg, #1a1a2e 0%, #0f3460 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        width: '60px', height: '60px', borderRadius: '50%',
        background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)',
        border: '2px solid rgba(255,255,255,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <svg width="26" height="26" viewBox="0 0 24 24" fill="white" style={{ marginLeft: '3px' }}>
          <path d="M8 5v14l11-7z"/>
        </svg>
      </div>
    </div>
  </a>
);

// ─── Página de cuenta suspendida ─────────────────────────────────────────────
const SuspendedPage: React.FC<{ reason: 'disabled' | 'expired' }> = ({ reason }) => (
  <div style={{
    minHeight: '100dvh',
    background: 'linear-gradient(135deg, #080101 0%, #0d0300 50%, #080101 100%)',
    display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    fontFamily: "'Inter', -apple-system, sans-serif",
    padding: '24px', textAlign: 'center',
    position: 'relative', overflow: 'hidden',
  }}>
    {/* Grid background */}
    <div style={{
      position: 'absolute', inset: 0, pointerEvents: 'none',
      backgroundImage: 'linear-gradient(rgba(255,107,53,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,53,0.04) 1px, transparent 1px)',
      backgroundSize: '48px 48px',
    }} />
    {/* Glow orb */}
    <div style={{
      position: 'absolute', top: '10%', left: '50%', transform: 'translateX(-50%)',
      width: '500px', height: '500px', borderRadius: '50%',
      background: 'radial-gradient(circle, rgba(239,68,68,0.07) 0%, transparent 65%)',
      pointerEvents: 'none',
    }} />

    <div style={{ position: 'relative', zIndex: 1, maxWidth: '400px', width: '100%' }}>
      {/* Lock icon with pulse ring */}
      <div style={{ position: 'relative', width: '88px', height: '88px', margin: '0 auto 32px' }}>
        <div style={{
          position: 'absolute', inset: '-8px', borderRadius: '30px',
          border: '1px solid rgba(239,68,68,0.15)',
          animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
        }} />
        <div style={{
          width: '88px', height: '88px',
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.22)',
          borderRadius: '26px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 60px rgba(239,68,68,0.1)',
        }}>
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(239,68,68,0.7)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
      </div>

      {/* Brand */}
      <div style={{
        fontSize: '9px', letterSpacing: '5px', color: 'rgba(255,107,53,0.4)',
        fontWeight: 800, marginBottom: '20px', textTransform: 'uppercase',
      }}>
        CONNEXO
      </div>

      {/* Status badge */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        padding: '4px 14px', borderRadius: '100px',
        background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
        fontSize: '10px', fontWeight: 800, letterSpacing: '1.5px', color: '#ef4444',
        textTransform: 'uppercase', marginBottom: '20px',
      }}>
        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
        {reason === 'expired' ? 'SUSCRIPCIÓN VENCIDA' : 'PERFIL INACTIVO'}
      </div>

      <h1 style={{
        color: '#fff', fontSize: '24px', fontWeight: 900,
        marginBottom: '14px', lineHeight: 1.2, letterSpacing: '-0.5px',
      }}>
        Este perfil no está<br />disponible actualmente
      </h1>

      <p style={{
        color: 'rgba(255,255,255,0.38)', fontSize: '14px',
        lineHeight: 1.8, marginBottom: '36px',
      }}>
        {reason === 'expired'
          ? 'El período de prueba de este perfil ha finalizado. El titular debe renovar su suscripción con Connexo para reactivarlo.'
          : 'Este perfil ha sido pausado temporalmente. Si eres el titular, contacta a soporte para reactivarlo.'}
      </p>

      {/* WhatsApp CTA — primary */}
      <a
        href={`https://wa.me/584226469177?text=${encodeURIComponent(
          reason === 'expired'
            ? '¡Hola Connexo! El período de prueba de mi perfil venció y necesito reactivarlo. ¿Cuáles son los planes disponibles?'
            : '¡Hola Connexo! Mi perfil está inactivo y necesito soporte para reactivarlo.'
        )}`}
        target="_blank" rel="noopener noreferrer"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
          padding: '16px 32px', borderRadius: '100px',
          background: 'linear-gradient(135deg, #25d366 0%, #128c7e 100%)',
          color: '#fff', textDecoration: 'none',
          fontSize: '15px', fontWeight: 800, letterSpacing: '0.3px',
          boxShadow: '0 4px 28px rgba(37,211,102,0.25)',
          marginBottom: '14px',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        Contactar a Soporte
      </a>

      {/* Secondary link */}
      <a
        href="https://connexoapp.com"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '12px 28px', borderRadius: '100px',
          background: 'transparent',
          border: '1px solid rgba(255,107,53,0.2)',
          color: 'rgba(255,107,53,0.6)', textDecoration: 'none',
          fontSize: '13px', fontWeight: 700, letterSpacing: '0.3px',
        }}
      >
        Ver planes Connexo
      </a>

      <div style={{ marginTop: '48px', fontSize: '11px', color: 'rgba(255,255,255,0.1)', letterSpacing: '1px' }}>
        connexoapp.com
      </div>
    </div>

    <style>{`
      @keyframes ping {
        75%, 100% { transform: scale(1.4); opacity: 0; }
      }
    `}</style>
  </div>
);

const PublicProfile: React.FC = () => {
  const { username } = useParams<{ username: string }>();
  const location = useLocation();

  /**
   * El identificador con el que se busca el perfil.
   *
   * ⚠️ NO basta con el parámetro `:username`. Hay perfiles cuyo nombre de
   * usuario contiene una BARRA (p. ej. "marcelo/mariapaz"), y en la URL una
   * barra separa segmentos: `useParams` sólo devuelve el primer trozo
   * ("marcelo") y la búsqueda no encuentra nada. La clave real es la ruta
   * completa, que es exactamente lo que se guardó como username.
   *
   * Se decodifica porque el navegador escapa los espacios y las tildes
   * (`/jose%20enrique`), y en la base están guardados sin escapar.
   */
  const perfilKey = React.useMemo(() => {
    const bruto = (location.pathname || '').replace(/^\/+/, '').replace(/\/+$/, '');
    if (!bruto) return username || '';
    try {
      return decodeURIComponent(bruto);
    } catch (_) {
      // Porcentaje mal formado en la URL: se busca tal cual antes que reventar.
      return bruto;
    }
  }, [location.pathname, username]);

  console.log('PublicProfile - MOUNTED - Received username:', perfilKey); // <-- LOG AÑADIDO

  const navigate = useNavigate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [links, setLinks] = useState<UserLink[]>([]);
  const [contactInfo, setContactInfo] = useState<ContactInfo | null>(null);
  const [appearance, setAppearance] = useState<AppearanceSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isVCardLoading, setIsVCardLoading] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [visitorProfile, setVisitorProfile] = useState<any>(null); // Para guardar el perfil del VISITANTE
  const [foundUserId, setFoundUserId] = useState<string | null>(null); // Nuevo estado para guardar el userId encontrado
  const userId = foundUserId;

  // Estados para el lightbox de galería
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [openAlbum, setOpenAlbum] = useState<any | null>(null);

  // Estados para el formulario de testimonios
  const [showTestimonialForm, setShowTestimonialForm] = useState(false);
  const [newTestimonial, setNewTestimonial] = useState({ quote: '', author: '', authorTitle: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Estados para el formulario de leads
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadData, setLeadData] = useState({ name: '', email: '', phone: '', notes: '' });
  const [isStartingChat, setIsStartingChat] = useState(false);
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);
  
  // Estado para el modal de QR
  const [showQRModal, setShowQRModal] = useState(false);
  const qrWrapperRef = useRef<HTMLDivElement | null>(null);

  // Estado de suspensión de cuenta
  const [suspended, setSuspended] = useState<'disabled' | 'expired' | null>(null);

  // Estado para tracking de heatmap (ULTRA)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false);

  // Estados para FAQs accordion
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  // Vista de catálogo a página completa ("Ver todo")
  const [showFullCatalog, setShowFullCatalog] = useState(false);

  
  // Ubicaciones a mostrar (soporta múltiples ubicaciones si existen)
  const locationsToShow = Array.isArray(profile?.locations) && profile.locations.length > 0
    ? profile.locations
    : profile?.location
      ? [profile.location]
      : [];

  // Simulate checking auth status. In a real app, this would come from an Auth Context.
  const [isAuthenticated] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user;
      console.log('PublicProfile Auth - Visitante detectado:', user?.id || 'No logueado');
      setCurrentUser(user as any);

      if (user) {
        Promise.resolve(supabase.from('profiles').select('*').eq('id', user.id).single())
          .then(({ data }) => {
            if (data) {
              console.log('Visitante es plan:', data?.plan);
              setVisitorProfile({
                ...data,
                plan: data.plan ? data.plan.toLowerCase() : 'conecta'
              });
            } else {
              setVisitorProfile(null);
            }
          })
          .catch((error) => {
            console.error(
              'Error obteniendo perfil del visitante:',
              error?.message || error || 'Ocurrió un error desconocido'
            );
            setVisitorProfile(null);
          });
      } else {
        setVisitorProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      if (!perfilKey) {
        console.log("No username found in URL.");
        setLoading(false);
        setIsLoading(false);
        return;
      }

      setLoading(true);
      setIsLoading(true);
      let foundUserId = null; // Variable para guardar el ID
      let userProfile: any = null; // Declarar fuera del bloque

      try {
        // 1. Buscar el perfil por username
        console.log("Fetching profile for username:", perfilKey);
        const { data: profileSnap, error: profileError } = await supabase.from('profiles').select('*').eq('username', perfilKey).limit(1);

        if (profileSnap && profileSnap.length > 0) {
          userProfile = {
            ...profileSnap[0],
            plan: profileSnap[0].plan ? profileSnap[0].plan.toLowerCase() : 'conecta'
          };
          foundUserId = userProfile.id; // <-- Guardamos el User ID real
          setFoundUserId(foundUserId); // Guardamos en el estado

          // ── Verificar si el perfil está desactivado manualmente ──────────
          if (userProfile.is_active === false) {
            setSuspended('disabled');
            setLoading(false);
            setIsLoading(false);
            return;
          }

          // ── Verificar si el trial expiró ──────────────────────────────────
          const { data: subSnap } = await supabase
            .from('subscriptions')
            .select('account_status, trial_ends_at')
            .eq('user_id', foundUserId)
            .maybeSingle();

          if (subSnap) {
            const isExpiredStatus = subSnap.account_status === 'expired';
            const isTrialOverdue = subSnap.account_status === 'trial'
              && subSnap.trial_ends_at
              && new Date(subSnap.trial_ends_at) < new Date();

            if (isExpiredStatus || isTrialOverdue) {
              setSuspended('expired');
              setLoading(false);
              setIsLoading(false);
              return;
            }
          }

          setProfile(userProfile);
          console.log("Profile found for username. User ID:", foundUserId);

          // Enable heatmap tracking for ULTRA plan
          if (userProfile.plan === 'ultra') {
            setHeatmapEnabled(true);
          }

          // 2. Track profile view
          trackProfileView(foundUserId, userProfile.plan || 'conecta');
        } else {
          console.error("Profile not found for username:", perfilKey);
          setProfile(null);
          setLinks([]);
          setFoundUserId(null); // Limpiar el estado
          setLoading(false); // Detener si no hay perfil
          setIsLoading(false);
          return; // Salir si no hay perfil
        }

        // 3. Si encontramos el perfil, buscar sus enlaces usando el userId
        console.log("Fetching links for User ID:", foundUserId);
        // 1. QUERY LIMPIO SIN orderBy
        const { data: linksSnapshot, error: linksError } = await supabase.from('links').select('*').eq('userId', foundUserId);
        
        const fetchedLinks = (linksSnapshot || []).map(doc => {
          const data = doc;
          return {
            id: doc.id,
            ...data,
            order: typeof data.order === 'number' ? data.order : 9999
          };
        });

        // 2. ORDENAR EN JAVASCRIPT
        fetchedLinks.sort((a, b) => a.order - b.order);
        
        // 3. Guardar en el estado
        setLinks(fetchedLinks);
        console.log("Links fetched:", fetchedLinks.length);

      } catch (error) {
        console.error(
          "Error fetching public profile data:",
          error?.message || error || 'Ocurrió un error desconocido'
        );
        setProfile(null);
        setLinks([]);
      } finally {
        setLoading(false);
        console.log("Fetch complete. Loading set to false.");
      }
    };

    fetchData();
  }, [perfilKey]); // <-- Depende de la ruta completa, no sólo del primer segmento
  
  // Registro de visita. Antes llamaba a la Edge Function `trackView`, que no
  // existe en el proyecto (404) — ahora es una RPC. Ver setup_analytics.sql.
  const trackProfileView = (userId: string, _userPlan: string) => {
    recordProfileView(userId);
  };

  // Se pasa a las 9 plantillas. Ojo: NO lleva preventDefault — el `<a>` navega
  // de forma nativa y la RPC sale en segundo plano. La versión anterior hacía
  // preventDefault + window.open, que los bloqueadores de ventanas emergentes
  // pueden llegar a cancelar.
  const handleLinkClick = (linkId: string, _url?: string) => {
    if (!foundUserId) return;
    recordLinkClick(foundUserId, linkId);
  };

  const downloadVCard = async () => {
    if (!profile) return;
    setIsVCardLoading(true);
    try {
      // Generar vCard con los datos reales del perfil
      const nameParts = profile.displayName.split(' ');
      const firstName = nameParts[0] || '';
      const restOfName = nameParts.slice(1).join(' ') || '';

      const website = profile.socialMedia?.website?.trim();

      const vCardLines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:;${firstName} ${restOfName};;;`,
        `FN:${profile.displayName}`,
        `EMAIL;TYPE=INTERNET,PREF:${profile.contactEmail || profile.email || ''}`,
        `TEL;TYPE=CELL,VOICE:${profile.phone || ''}`,
        `TEL;TYPE=CELL,VOICE:${profile.whatsapp || ''}`,
      ];

      const locationsForVCard = Array.isArray(profile.locations) && profile.locations.length > 0
        ? profile.locations
        : profile.location
          ? [profile.location]
          : [];

      if (locationsForVCard.length > 0) {
        locationsForVCard.forEach((loc) => {
          vCardLines.push(`ADR;TYPE=WORK:;;${loc};;;`);
        });
      } else {
        vCardLines.push('ADR;TYPE=WORK:;;;;;');
      }

      vCardLines.push(`URL:${website || window.location.href}`);
      vCardLines.push('END:VCARD');

      const vCardData = vCardLines.join('\n');

      const blob = new Blob([vCardData], { type: 'text/vcard;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const filename = `${profile.displayName.replace(/\s+/g, '_') || 'contact'}.vcf`;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Failed to generate VCard:", error?.message || error || 'Ocurrió un error desconocido');
    } finally {
      setIsVCardLoading(false);
    }
  };

  // Wrappers con los nombres esperados
  const handleDownloadVCard = () => {
    return downloadVCard();
  };
  const handleShareProfile = () => {
    return handleShare();
  };

  const handleSaveContactClick = () => {
    setIsContactModalOpen(true);
  };

  const handleSaveAndShare = (visitorData: { name: string; email: string; phone: string }) => {
    console.log("Lead captured:", visitorData);
    // Simulate real-time notification for the admin
    localStorage.setItem('newLead', JSON.stringify(visitorData));
    downloadVCard();
    setIsContactModalOpen(false);
  };

  const handleSaveWithoutSharing = () => {
    downloadVCard();
    setIsContactModalOpen(false);
  };

  const handleDownloadQR = () => {
    const canvas = qrWrapperRef.current?.querySelector('canvas');
    if (!canvas) return;
    const pngUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = pngUrl;
    const fileName = `${profile?.username || profile?.displayName?.replace(/\s+/g, '-') || 'connexo-profile'}-qr.png`;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleStartChat = async () => {
    if (!currentUser) {
      alert("Debes iniciar sesión para enviar un mensaje.");
      navigate('/auth');
      return;
    }
    if (!userId) {
      alert("No se pudo identificar al propietario del perfil.");
      return;
    }
    if ((currentUser as any).id === userId || (currentUser as any).uid === userId) {
      alert("No puedes enviarte mensajes a ti mismo.");
      return;
    }

    setIsStartingChat(true);
    try {
      const { data, error } = await supabase.functions.invoke('startChat', {
        body: { receiverId: userId }
      });
      if (error) throw error;
      const chatId = data?.chatId;
      if (chatId) {
        navigate('/dashboard', { state: { openChatId: chatId } });
      }
    } catch (error: any) {
      alert(`Error al iniciar chat: ${error?.message || 'Error'}`);
    } finally {
      setIsStartingChat(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: profile?.displayName || 'Mi Perfil Connexo',
          text: `Echa un vistazo a mi perfil: ${profile?.displayName}`,
          url: window.location.href,
        });
      } catch (error) {
        console.error(
          'Error al compartir:',
          error?.message || error || 'Ocurrió un error desconocido'
        );
      }
    } else {
      // Fallback para copiar al portapapeles si navigator.share no existe
      navigator.clipboard.writeText(window.location.href);
      alert('¡Perfil copiado al portapapeles!');
    }
  };

  // Funciones del lightbox
  const openLightbox = (index: number, images?: string[]) => {
    const imagesToUse = Array.isArray(images) && images.length > 0
      ? images
      : (profile?.galleryImageURLs || []);
    setLightboxImages(imagesToUse);
    setCurrentImageIndex(index);
    setLightboxOpen(true);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
  };

  const goToPrevious = () => {
    if (lightboxImages.length > 0) {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === 0 ? lightboxImages.length - 1 : prevIndex - 1
      );
    }
  };

  const goToNext = () => {
    if (lightboxImages.length > 0) {
      setCurrentImageIndex((prevIndex) =>
        prevIndex === lightboxImages.length - 1 ? 0 : prevIndex + 1
      );
    }
  };

  // Event listeners para teclado
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!lightboxOpen) return;

      switch (event.key) {
        case 'Escape':
          closeLightbox();
          break;
        case 'ArrowLeft':
          goToPrevious();
          break;
        case 'ArrowRight':
          goToNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [lightboxOpen, currentImageIndex, lightboxImages]);

  // Función para enviar testimonio
  const handleSubmitTestimonial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || !foundUserId) { // Asegurarse de tener el ID del dueño
        alert("Error: No se pudo identificar el perfil.");
        return;
    }
    if (newTestimonial.quote.trim().length < 10 || newTestimonial.author.trim().length < 2) {
        alert("Por favor, completa el testimonio y tu nombre.");
        return;
    }

    setIsSubmitting(true);

    try {
      // Antes esto llamaba a la Edge Function `submitTestimonial`, que NUNCA
      // existió en el proyecto: el visitante rellenaba la reseña, pulsaba
      // Enviar y la llamada fallaba, así que no llegaba a ninguna parte.
      // Ahora va por RPC, igual que el resto de escrituras anónimas de la app
      // (join_gastro_club, place_ecom_order, join_stage_fanbase…).
      const { data, error } = await supabase.rpc('submit_testimonial', {
        p_owner_id: foundUserId,
        p_quote: newTestimonial.quote,
        p_author: newTestimonial.author,
        p_author_title: newTestimonial.authorTitle || null,
      });
      if (error) throw error;

      if (data && data.ok === false) {
        const motivos: Record<string, string> = {
          perfil_no_encontrado: 'No se pudo identificar el perfil.',
          texto_corto: 'La reseña es demasiado corta.',
          nombre_corto: 'Escribe tu nombre.',
          demasiadas_resenas: 'Este perfil ya recibió muchas reseñas en la última hora. Inténtalo más tarde.',
        };
        alert(motivos[data.error] || 'No se pudo enviar la reseña.');
        return;
      }

      alert('¡Gracias! Tu reseña se envió y aparecerá cuando el dueño del perfil la apruebe.');
      setShowTestimonialForm(false);
      setNewTestimonial({ quote: '', author: '', authorTitle: '' });

    } catch (error: any) {
      console.error("Error al enviar testimonio:", error?.message || error || 'Ocurrió un error desconocido');
      // Si la RPC todavía no existe en la base, el mensaje de Supabase es
      // críptico; se traduce para que se sepa qué falta ejecutar.
      const msg = String(error?.message || '');
      if (/submit_testimonial|function.*does not exist|PGRST202/i.test(msg)) {
        alert('Las reseñas aún no están activadas en este perfil. (Falta ejecutar setup_testimonials.sql)');
      } else {
        alert(`Error: ${error?.message || 'No se pudo enviar la reseña.'}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Modal público de reseñas, en un solo sitio.
  // Estaba duplicado en dos ramas de plantilla y **faltaba en la de ecom**:
  // allí el botón "Dejar Reseña" encendía el estado pero no había nada que
  // dibujar, así que al pulsarlo no ocurría absolutamente nada.
  const testimonialModal = showTestimonialForm && (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[10001] p-4">
      <div className="bg-gray-950/95 border border-white/10 p-6 rounded-2xl shadow-2xl w-full max-w-md text-white cinema-animate-in">
        <h3 className="text-lg font-semibold tracking-wide mb-5">Deja tu Reseña</h3>
        <form onSubmit={handleSubmitTestimonial}>
          <div className="mb-4">
            <label className="block text-xs tracking-widest uppercase opacity-40 mb-2">Tu Reseña</label>
            <textarea
              required
              rows={4}
              value={newTestimonial.quote}
              onChange={(e) => setNewTestimonial(prev => ({ ...prev, quote: e.target.value }))}
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none text-sm resize-none transition"
            />
          </div>
          <div className="mb-4">
            <label className="block text-xs tracking-widest uppercase opacity-40 mb-2">Tu Nombre</label>
            <input
              required
              type="text"
              value={newTestimonial.author}
              onChange={(e) => setNewTestimonial(prev => ({ ...prev, author: e.target.value }))}
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none text-sm transition"
            />
          </div>
          <div className="mb-5">
            <label className="block text-xs tracking-widest uppercase opacity-40 mb-2">Cargo / Empresa (Opcional)</label>
            <input
              type="text"
              value={newTestimonial.authorTitle}
              onChange={(e) => setNewTestimonial(prev => ({ ...prev, authorTitle: e.target.value }))}
              className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none text-sm transition"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowTestimonialForm(false)}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-sm opacity-50 hover:opacity-80 transition border border-white/10 disabled:opacity-30"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 rounded-xl text-sm font-semibold transition bg-white/10 hover:bg-white/20 border border-white/10 disabled:opacity-30"
            >
              {isSubmitting ? 'Enviando...' : 'Enviar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  // Función para enviar lead
  const handleSubmitLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!foundUserId) {
      alert("Error: No se pudo identificar el perfil.");
      return;
    }
    // Añadir validaciones básicas de campos aquí si quieres
    if (!leadData.name.trim()) {
      alert("Por favor, ingresa tu nombre.");
      return;
    }
    if (!leadData.email.trim()) {
      alert("Por favor, ingresa tu email.");
      return;
    }
    if (!leadData.email.includes('@')) {
      alert("Por favor, ingresa un email válido.");
      return;
    }

    setIsSubmittingLead(true);

    try {
      // Antes llamaba a la Edge Function `submitLead`, que devuelve 404: nunca
      // se desplegó, así que el visitante SIEMPRE veía un error y el lead no
      // llegaba a ninguna parte. Ahora es una RPC — ver setup_leads.sql.
      const { data, error } = await supabase.rpc('submit_lead', {
        p_owner_id: foundUserId,
        p_name: leadData.name,
        p_email: leadData.email,
        p_phone: leadData.phone || null,
        p_notes: leadData.notes || null,
      });

      if (error) {
        const msg = error.message || '';
        if (/submit_lead|function.*does not exist|PGRST202/i.test(msg)) {
          throw new Error('La captura de contactos aún no está activada en este perfil. (Falta ejecutar setup_leads.sql)');
        }
        throw error;
      }

      if (data && data.ok === false) {
        const motivos: Record<string, string> = {
          perfil_no_encontrado: 'No encontramos este perfil.',
          nombre_corto:         'Escribe tu nombre completo.',
          email_invalido:       'Revisa el correo electrónico.',
          demasiados_envios:    'Hemos recibido muchos envíos. Inténtalo en un rato.',
        };
        throw new Error(motivos[data.error] || 'No se pudo enviar.');
      }

      alert('¡Información enviada!');
      setShowLeadForm(false);
      setLeadData({ name: '', email: '', phone: '', notes: '' });

    } catch (error: any) {
      console.error("Error al enviar lead:", error?.message || error || 'Ocurrió un error desconocido');
      alert(`Error: ${error?.message || 'No se pudo enviar.'}`);
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const sectionOrder = Array.isArray(profile?.sectionOrder)
    ? [...(profile.sectionOrder as SectionOrder[])].sort((a, b) => a.order - b.order)
    : [];

  const defaultSectionOrder: SectionOrder[] = [
    { type: 'video', enabled: !!(profile as any)?.uploadedVideoURL || !!profile?.featuredVideoURL, order: 0 },
    { type: 'links', enabled: Array.isArray(links) && links.some((l) => l.isActive), order: 1 },
    { type: 'products', enabled: Array.isArray(profile?.products) && profile.products.length > 0, order: 2 },
    {
      type: 'gallery',
      enabled:
        profile?.galleryMode === 'albums'
          ? Array.isArray((profile as any)?.albums) && (profile as any).albums.length > 0
          : Array.isArray(profile?.galleryImageURLs) && profile.galleryImageURLs.length > 0,
      order: 3,
    },
    { type: 'files', enabled: profile?.plan === 'ultra' && Array.isArray(profile?.digitalFiles) && profile.digitalFiles.length > 0, order: 4 },
    { type: 'testimonials', enabled: Array.isArray(profile?.testimonials) && profile.testimonials.length > 0, order: 5 },
    { type: 'faqs', enabled: profile?.plan === 'ultra' && Array.isArray(profile?.faqs) && profile.faqs.length > 0, order: 6 },
    {
      type: 'schedule',
      enabled:
        !!profile?.showSchedule && Array.isArray(profile?.businessHours) && profile.businessHours.length > 0,
      order: 7,
    },
    {
      type: 'calendar',
      enabled: !!profile?.showCalendar,
      order: 8,
    },
  ];

  const shouldRenderSection = (section: SectionOrder) => {
    if (!section.enabled) return false;
    // Organizar secciones: ocultar si el dueño la marcó como oculta en el admin.
    // 'files' en el perfil corresponde a 'archives' en el organizador.
    const visKey = section.type === 'files' ? 'archives' : section.type;
    if ((profile as any)?.sectionVisibility?.[visKey] === false) return false;
    if (section.type === 'files' && profile?.plan !== 'ultra') return false;
    if (section.type === 'faqs' && profile?.plan !== 'ultra') return false;
    if (section.type === 'schedule' && (!profile?.showSchedule || !Array.isArray(profile.businessHours) || profile.businessHours.length === 0)) return false;
    if (section.type === 'calendar' && !profile?.showCalendar) return false;
    if (section.type === 'video' && profile?.plan !== 'ultra') return false;
    if (section.type === 'video' && !(profile as any)?.uploadedVideoURL && !profile?.featuredVideoURL) return false;
    if (section.type === 'links' && (!Array.isArray(links) || links.filter(l => l.isActive).length === 0)) return false;
    if (section.type === 'products' && (!Array.isArray(profile?.products) || profile.products.length === 0)) return false;
    if (section.type === 'gallery') {
      const isAlbumsMode = profile?.galleryMode === 'albums';
      if (isAlbumsMode) {
        const albums = (profile as any)?.albums;
        if (!Array.isArray(albums) || albums.length === 0) return false;
      } else {
        if (!Array.isArray(profile?.galleryImageURLs) || profile.galleryImageURLs.length === 0) return false;
      }
    }
    if (section.type === 'testimonials' && (!Array.isArray(profile?.testimonials) || profile.testimonials.length === 0)) return false;
    if (section.type === 'files' && (!Array.isArray(profile?.digitalFiles) || profile.digitalFiles.length === 0)) return false;
    if (section.type === 'faqs' && (!Array.isArray(profile?.faqs) || profile.faqs.length === 0)) return false;
    return true;
  };

  const renderSection = (section: SectionOrder) => {
    switch (section.type) {
      case 'video': {
        const uploadedSrc = (profile as any)?.uploadedVideoURL as string | undefined;
        const rawVideos: Array<{ url: string; thumbnailURL?: string }> =
          Array.isArray((profile as any)?.featuredVideos) && (profile as any).featuredVideos.length > 0
            ? (profile as any).featuredVideos.filter((v: any) => v?.url)
            : profile?.featuredVideoURL ? [{ url: profile.featuredVideoURL }] : [];
        const isVertical = profile?.videoOrientation === 'vertical';

        if (!uploadedSrc && rawVideos.length === 0) return null;

        return (
          <div key={section.type} className="brutal-card p-5">
            <p className="brutal-label mb-4">Video Destacado</p>
            {uploadedSrc ? (
              <video src={uploadedSrc} controls className="w-full rounded-xl shadow-lg bg-black" poster={profile?.coverImageURL}>
                Tu navegador no soporta videos HTML5.
              </video>
            ) : (
              <div className={isVertical ? 'grid grid-cols-2 gap-3' : 'space-y-4'}>
                {rawVideos.map((v, i) => (
                  <VideoLinkCard key={i} href={v.url} thumbnailURL={v.thumbnailURL} isVertical={isVertical} />
                ))}
              </div>
            )}
          </div>
        );
      }
      case 'links':
        return (
          <div key={section.type} className="brutal-card p-5">
            <p className="brutal-label mb-4">Mis Enlaces</p>
            <div className="space-y-3">
              {links
                .filter((l) => l.isActive)
                .map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick(link.id)}
                    className={`block py-3 px-5 text-sm text-center font-medium tracking-wide transition-all duration-200 hover:-translate-y-0.5 active:scale-100
                              ${profile?.buttonStyle === 'sharp' ? 'rounded-none' : profile?.buttonStyle === 'pills' ? 'rounded-full' : 'rounded-xl'}`}
                    style={{
                      backgroundColor: profile?.buttonColor || '#ff6b35',
                      color: profile?.buttonTextColor || '#ffffff',
                      borderWidth: `${profile?.borderWidth ?? 0}px`,
                      borderColor: profile?.borderColor || 'transparent',
                      borderStyle: 'solid',
                      boxShadow:
                        profile?.shadow === 'soft'
                          ? '0 8px 20px rgba(0,0,0,0.35)'
                          : profile?.shadow === 'hard'
                          ? '0 12px 32px rgba(0,0,0,0.55)'
                          : `0 4px 16px ${(profile?.buttonColor || '#ff6b35')}33`,
                    }}
                  >
                    {link.title}
                  </a>
                ))}
            </div>
          </div>
        );
      case 'products':
        return (
          <div key={section.type} className="brutal-card p-5">
            <p className="brutal-label mb-4">Productos</p>
            <div className="grid grid-cols-2 gap-4">
              {profile!.products!.map((product) => (
                <div
                  key={product.id}
                  onClick={() => {
                    console.log("Producto clickeado:", product);
                    setSelectedProduct(product);
                  }}
                  className="cinema-card-flat overflow-hidden shadow-lg block transition-all duration-200 hover:scale-[1.02] hover:-translate-y-0.5 cursor-pointer"
                  style={{ color: profile?.productsTextColor || profile?.textColor || '#ffffff' }}
                >
                  {product.imageURL && (
                    <img
                      src={product.imageURL}
                      alt={product.name}
                      className="w-full h-32 object-cover"
                    />
                  )}
                  <div className="p-3">
                    <h3 className="font-semibold">{product.name}</h3>
                    {product.shortDescription && <p className="text-sm mt-1 opacity-80 truncate">{product.shortDescription}</p>}
                    {product.price && (
                      <p className="font-bold mt-2" style={{ color: profile?.buttonTextColor || '#ffffff' }}>
                        {product.price}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {profile!.products!.length > 4 && (
              <button
                type="button"
                onClick={() => setShowFullCatalog(true)}
                style={{ backgroundColor: profile?.buttonColor || '#ff6b35', color: profile?.buttonTextColor || '#ffffff' }}
                className="mt-4 w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all hover:brightness-110 active:scale-95">
                Ver todos los productos ({profile!.products!.length})
              </button>
            )}
          </div>
        );
      case 'gallery':
        {
          const albums = (profile as any)?.albums;
          const isAlbumsMode = profile?.galleryMode === 'albums' && Array.isArray(albums) && albums.length > 0;

          if (isAlbumsMode) {
            return (
              <div key={section.type} className="brutal-card p-5">
                <p className="brutal-label mb-4">{profile?.galleryTitle?.trim() || 'Galería'}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {albums.map((album: any) => (
                    <button
                      key={album.id}
                      type="button"
                      onClick={() => setOpenAlbum(album)}
                      className="text-left cinema-card overflow-hidden transition-all duration-200 hover:scale-[1.02]"
                    >
                      {album.coverImage && (
                        <img
                          src={album.coverImage}
                          alt={album.title}
                          className="w-full h-28 object-cover"
                        />
                      )}
                      <div className="p-3">
                        <div className="font-semibold truncate text-sm">{album.title}</div>
                        <div className="text-xs opacity-50 mt-0.5">{Array.isArray(album.images) ? album.images.length : 0} fotos</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          }

          return (
            <div key={section.type} className="brutal-card p-5">
              <p className="brutal-label mb-4">{profile?.galleryTitle?.trim() || 'Galería'}</p>
              <div className="grid grid-cols-3 gap-1.5">
                {profile!.galleryImageURLs!.map((imgUrl, index) => (
                  <div key={index} className="aspect-square rounded-xl overflow-hidden">
                    <img
                      src={imgUrl}
                      alt={`Imagen de galería ${index + 1}`}
                      className="w-full h-full object-cover cursor-pointer transition-all duration-200 hover:scale-105 hover:brightness-110"
                      onClick={() => openLightbox(index, profile!.galleryImageURLs!)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        }
      case 'testimonials':
        return (
          <div key={section.type} className="brutal-card p-5">
            <p className="brutal-label mb-4">Testimonios</p>
            <div className="space-y-3">
              {profile!.testimonials!.map((testimonial) => (
                <div
                  key={testimonial.id}
                  className="cinema-card-flat p-4 text-center"
                  style={{ color: profile?.testimonialsTextColor || profile?.textColor || '#ffffff' }}
                >
                  <p className="italic text-sm leading-relaxed opacity-85">"{testimonial.quote}"</p>
                  <div className="mt-3 flex items-center justify-center space-x-2">
                    {testimonial.authorImageURL && (
                      <img
                        src={testimonial.authorImageURL}
                        alt={testimonial.author}
                        className="w-8 h-8 rounded-full object-cover border border-white/10"
                      />
                    )}
                    <div>
                      <p className="font-semibold text-sm">{testimonial.author}</p>
                      {testimonial.authorTitle && (
                        <p className="text-xs opacity-50 tracking-wide">{testimonial.authorTitle}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowTestimonialForm(true)}
                className="text-xs tracking-widest uppercase opacity-50 hover:opacity-80 transition py-2 px-4 border border-white/10 rounded-full"
              >
                Dejar Testimonio
              </button>
            </div>
          </div>
        );
      case 'schedule':
        return (
          <div key={section.type} className="brutal-card p-5">
            <p className="brutal-label mb-4">Horarios de Atención</p>
            <ul className="space-y-2">
              {profile!.businessHours!.map((day: any, index: number) => (
                <li key={index} className="flex justify-between text-sm border-b border-white/5 pb-2 last:border-0 last:pb-0">
                  <span className="capitalize opacity-70">{day.day}</span>
                  <span className="text-orange-400/80 font-medium">
                    {day.time ? day.time : day.isOpen && day.openTime && day.closeTime ? `${day.openTime} — ${day.closeTime}` : 'Cerrado'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        );
      case 'calendar':
        return profile?.calendarWebhookUrl ? (
          <div key={section.type} className="brutal-card p-5">
            <p className="brutal-label mb-4">Reservar Cita</p>
            <a href={profile.calendarWebhookUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg transition-all hover:scale-[1.02] active:scale-95"
              style={{ backgroundColor: profile.buttonColor || '#ff6600', color: profile.buttonTextColor || '#fff' }}>
              📅 Agendar
            </a>
          </div>
        ) : null;
      case 'files':
        return (
          <div key={section.type} className="brutal-card p-5">
            <p className="brutal-label mb-4">Archivos Digitales</p>
            <div className="space-y-3">
              {profile!.digitalFiles!.map((file) => (
                <a
                  key={file.id}
                  href={file.fileURL || '#'}
                  download={file.fileName || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    if (!file.fileURL) {
                      e.preventDefault();
                    }
                  }}
                  className="flex items-center gap-4 p-4 cinema-card hover:scale-[1.01] transition-all duration-200"
                >
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{file.title}</p>
                    {file.description && <p className="text-xs opacity-50 mt-0.5">{file.description}</p>}
                    {file.fileType && <p className="text-xs opacity-30 mt-0.5 tracking-widest uppercase">{file.fileType}</p>}
                  </div>
                  <svg className="w-4 h-4 flex-shrink-0 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              ))}
            </div>
          </div>
        );
      case 'faqs':
        return (
          <div key={section.type} className="brutal-card p-5">
            <p className="brutal-label mb-4">Preguntas Frecuentes</p>
            <div className="space-y-2">
              {profile!.faqs!.map((faq, index) => (
                <div key={faq.id} className="border border-white/[0.07] rounded-xl overflow-hidden">
                  <button
                    onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition"
                  >
                    <span className="font-medium text-sm pr-4 opacity-85">{faq.question}</span>
                    <svg
                      className={`w-4 h-4 flex-shrink-0 opacity-40 transition-transform duration-200 ${openFaqIndex === index ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {openFaqIndex === index && (
                    <div className="px-4 pb-4 text-sm opacity-65 leading-relaxed border-t border-white/5">{faq.answer}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  const sectionsToRender = (sectionOrder.length > 0 ? sectionOrder : defaultSectionOrder).filter(shouldRenderSection);

  // Guardias de carga
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#080604]">
        <div className="cinema-breath flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-full border border-white/10 flex items-center justify-center">
            <div className="w-6 h-6 rounded-full bg-[var(--primary-orange)] opacity-80" />
          </div>
          <p className="text-white/30 text-xs tracking-widest uppercase">Cargando perfil</p>
        </div>
      </div>
    );
  }

  // Guardia extra: verificar que los datos necesarios existen
  if (!profile || !foundUserId) {
    console.error("PublicProfile: profile or foundUserId missing!", { profile, foundUserId });
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#210900] text-white">
        <div className="text-center">
          <h1 className="text-2xl mb-4">Perfil no encontrado</h1>
          <p>No se pudo encontrar el perfil para: <strong>{perfilKey}</strong></p>
          <button onClick={() => navigate('/dashboard')} className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm flex items-center space-x-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            <span>Dashboard</span>
          </button>
        </div>
      </div>
    );
  }
  // Perfil suspendido — mostrar página elegante
  if (suspended) {
    return <SuspendedPage reason={suspended} />;
  }

  console.log('PublicProfile - PASSED ALL GUARDS - Rendering main content now...');
  console.log('PublicProfile - Applying fontFamily:', profile?.fontFamily);
  console.log('PublicProfile - Applying textColor:', profile?.textColor);
  console.log('PublicProfile - Image URLs:', {
    profilePhoto: profile?.profilePhotoURL,
    coverImage: profile?.coverImageURL,
    logo: profile?.logoURL
  });

  if (profile?.theme === 'ecom') {
    return (
      <div className="public-profile-container">
        {currentUser && (
          <div className="fixed top-4 left-4 z-[999]">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-full text-xs flex items-center space-x-1.5 shadow-xl transition border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span>Dashboard</span>
            </button>
          </div>
        )}
        <React.Suspense fallback={<TemplateFallback />}>
        <ProfileEcomTemplate
          profile={profile}
          links={links}
          onLinkClick={handleLinkClick}
          onSelectProduct={setSelectedProduct}
          onOpenLeadForm={() => setShowLeadForm(true)}
          onLeaveTestimonial={() => setShowTestimonialForm(true)}
          currentUser={currentUser}
          visitorProfile={visitorProfile}
          userId={userId}
          downloadVCard={downloadVCard}
          handleShare={handleShare}
          setShowQRModal={setShowQRModal}
          isVCardLoading={isVCardLoading}
          handleStartChat={handleStartChat}
          isStartingChat={isStartingChat}
        />
        </React.Suspense>

        {/* QR Modal */}
        {showQRModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowQRModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Código QR del Catálogo</h3>
                <button onClick={() => setShowQRModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  <FaTimes size={20} />
                </button>
              </div>
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg" ref={qrWrapperRef}>
                  <QRCodeCanvas value={window.location.href} size={256} level="H" includeMargin bgColor="#ffffff" />
                </div>
                <button type="button" onClick={handleDownloadQR} className="mt-4 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-400">
                  Descargar QR (PNG)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reseñas: esta rama pasaba `onLeaveTestimonial` pero nunca dibujaba
            el formulario, así que el botón no hacía nada visible. */}
        {testimonialModal}
      </div>
    );
  }

  if (profile?.theme === 'gastro' || profile?.theme === 'petcare' || profile?.theme === 'medical') {
    // La clínica (petcare/medical) reutiliza toda la maquinaria gastro (pedidos,
    // reservas, inventario, club) pero con su propia plantilla pública
    // sobre la base del perfil por defecto (look accent-driven, no naranja gastro).
    const TemplateComp = profile?.theme === 'medical' ? ProfileMedicalTemplate : profile?.theme === 'petcare' ? ProfilePetcareTemplate : ProfileGastroTemplate;
    return (
      <div className="public-profile-container">
        {currentUser && (
          <div className="fixed top-4 left-4 z-[999]">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-full text-xs flex items-center space-x-1.5 shadow-xl transition border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span>Dashboard</span>
            </button>
          </div>
        )}
        <React.Suspense fallback={<TemplateFallback />}>
        <TemplateComp
          profile={profile}
          links={links}
          onLinkClick={handleLinkClick}
          onSelectProduct={setSelectedProduct}
          onOpenLeadForm={() => setShowLeadForm(true)}
          currentUser={currentUser}
          visitorProfile={visitorProfile}
          userId={userId}
          downloadVCard={downloadVCard}
          handleShare={handleShare}
          setShowQRModal={setShowQRModal}
          isVCardLoading={isVCardLoading}
          handleStartChat={handleStartChat}
          isStartingChat={isStartingChat}
        />
        </React.Suspense>

        {/* QR Modal */}
        {showQRModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowQRModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Código QR</h3>
                <button onClick={() => setShowQRModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  <FaTimes size={20} />
                </button>
              </div>
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg" ref={qrWrapperRef}>
                  <QRCodeCanvas value={window.location.href} size={256} level="H" includeMargin bgColor="#ffffff" />
                </div>
                <button type="button" onClick={handleDownloadQR} className="mt-4 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-400">
                  Descargar QR (PNG)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (profile?.theme === 'barber') {
    return (
      <div className="public-profile-container">
        {currentUser && (
          <div className="fixed top-4 left-4 z-[999]">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-full text-xs flex items-center space-x-1.5 shadow-xl transition border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span>Dashboard</span>
            </button>
          </div>
        )}
        <React.Suspense fallback={<TemplateFallback />}>
        <ProfileBarberTemplate
          profile={profile}
          links={links}
          onLinkClick={handleLinkClick}
          onSelectProduct={setSelectedProduct}
          onOpenLeadForm={() => setShowLeadForm(true)}
          currentUser={currentUser}
          visitorProfile={visitorProfile}
          userId={userId}
          downloadVCard={downloadVCard}
          handleShare={handleShare}
          setShowQRModal={setShowQRModal}
          isVCardLoading={isVCardLoading}
          handleStartChat={handleStartChat}
          isStartingChat={isStartingChat}
        />
        </React.Suspense>

        {/* Modal Álbum de Galería */}
        {openAlbum && (
          <div
            className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setOpenAlbum(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[90vh] bg-[var(--card-background)] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 border-b border-white/10 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setOpenAlbum(null)}
                  className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition"
                >
                  Volver
                </button>
                <h3 className="text-lg font-bold truncate px-4">{openAlbum?.title || 'Álbum'}</h3>
                <div className="w-20" />
              </div>

              <div className="p-4 overflow-y-auto">
                {Array.isArray(openAlbum?.images) && openAlbum.images.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {openAlbum.images.map((imgUrl: string, idx: number) => (
                      <button
                        key={`${imgUrl}_${idx}`}
                        type="button"
                        className="aspect-square rounded-lg overflow-hidden border border-white/10 hover:opacity-90 transition"
                        onClick={() => openLightbox(idx, openAlbum.images)}
                      >
                        <img src={imgUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-[var(--text-secondary)] py-10">Este álbum no tiene fotos aún.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal Formulario de Testimonios */}
        {testimonialModal}

        {/* Modal Formulario de Leads */}
        {showLeadForm && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md text-white">
              <h3 className="text-xl font-bold mb-4">Intercambiar Contacto</h3>
              <form onSubmit={handleSubmitLead}>
                <div className="mb-4">
                  <label className="block text-sm mb-1">Tu Nombre:</label>
                  <input
                    required
                    type="text"
                    value={leadData.name}
                    onChange={(e) => setLeadData(prev => ({...prev, name: e.target.value}))}
                    className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                    placeholder="Ingresa tu nombre completo"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm mb-1">Tu Email:</label>
                  <input
                    required
                    type="email"
                    value={leadData.email}
                    onChange={(e) => setLeadData(prev => ({...prev, email: e.target.value}))}
                    className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                    placeholder="tu@email.com"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm mb-1">Teléfono (Opcional):</label>
                  <input
                    type="tel"
                    value={leadData.phone}
                    onChange={(e) => setLeadData(prev => ({...prev, phone: e.target.value}))}
                    className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                    placeholder="+56 9 1234 5678"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm mb-1">Mensaje (Opcional):</label>
                  <textarea
                    rows={3}
                    value={leadData.notes}
                    onChange={(e) => setLeadData(prev => ({...prev, notes: e.target.value}))}
                    className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                    placeholder="¿En qué podemos ayudarte?"
                  />
                </div>
                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setShowLeadForm(false)}
                    disabled={isSubmittingLead}
                    className="px-4 py-2 rounded bg-gray-600 hover:bg-gray-500 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingLead}
                    className="px-4 py-2 rounded bg-green-600 hover:bg-green-500 disabled:opacity-50"
                  >
                    {isSubmittingLead ? 'Enviando...' : 'Enviar Info'}
                  </button>
                </div>
                <p className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400 text-center mt-4 leading-tight">
                  Tus datos serán compartidos exclusivamente con {profile?.displayName || 'el dueño del perfil'} y almacenados de forma segura por Connexo. Al enviar, aceptas nuestra <a href="https://www.connexo.tech/privacidad" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-300 transition-colors">Política de Privacidad</a>.
                </p>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Código QR */}
        {showQRModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowQRModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Código QR del Perfil</h3>
                <button
                  onClick={() => setShowQRModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  <FaTimes size={20} />
                </button>
              </div>
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg" ref={qrWrapperRef}>
                  <QRCodeCanvas
                    value={window.location.href}
                    size={256}
                    level="H"
                    includeMargin={true}
                    bgColor="#ffffff"
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 text-center">
                  Escanea este código para compartir el perfil
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-2 text-center break-all">
                  {window.location.href}
                </p>
                <button
                  type="button"
                  onClick={handleDownloadQR}
                  className="mt-4 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-300"
                >
                  Descargar QR (PNG)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Vista de catálogo a página completa */}
        {showFullCatalog && Array.isArray(profile?.products) && (
          <FullCatalogView
            items={profile!.products!.map((p: any) => ({
              id: String(p.id),
              name: p.name,
              price: p.price,
              image: p.imageURL,
              category: p.category,
              description: p.shortDescription || p.longDescription,
              raw: p,
            }))}
            onBack={() => setShowFullCatalog(false)}
            onSelect={(raw) => { setShowFullCatalog(false); setSelectedProduct(raw); }}
            accent={profile?.buttonColor || '#ff6b35'}
            bg={profile?.backgroundColor || '#080604'}
            text={profile?.textColor || '#ffffff'}
            fontFamily={profile?.fontFamily}
            title="Productos"
            searchPlaceholder="Buscar por nombre o categoría"
            ctaLabel="Ver →"
          />
        )}

        {/* Modal Detalle de Producto / Transaccional */}
        {selectedProduct && (
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedProduct(null)}
          >
            <div
              className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl relative max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}
              style={{
                 backgroundColor: profile?.backgroundColor || '#ffffff',
                 color: profile?.textColor || '#000000'
              }}
            >
              <div className="relative shrink-0">
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="absolute top-3 right-3 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                {selectedProduct.imageURL && (
                  <img
                    src={selectedProduct.imageURL}
                    alt={selectedProduct.name}
                    className="w-full h-48 sm:h-64 object-cover"
                  />
                )}
              </div>

              <div className="p-6 overflow-y-auto flex-1">
                <h2 className="text-2xl font-bold mb-2">{selectedProduct.name}</h2>
                {/* Suscripción: selector Mensual/Anual con el ahorro. Sólo se
                    dibuja en los productos que la tengan activada; en los demás
                    devuelve null y se ve el precio normal de siempre. */}
                {isSubscription(selectedProduct) ? (
                  <div className="mb-4">
                    <SubscriptionPricePicker subscription={selectedProduct.subscription}
                      accent={profile?.buttonColor || '#ff6b35'} />
                  </div>
                ) : selectedProduct.price && (
                    <p className="text-xl font-semibold text-blue-600 dark:text-blue-400 mb-4">
                      {selectedProduct.price}
                    </p>
                )}
                <div className="prose dark:prose-invert max-w-none opacity-90 whitespace-pre-wrap">
                  {selectedProduct.longDescription || selectedProduct.shortDescription || "Sin descripción detallada."}
                </div>
              </div>

              {selectedProduct.linkURL && (
                <div className="p-4 border-t border-gray-200 dark:border-gray-800 shrink-0 bg-gray-50 dark:bg-gray-900/50">
                  <a
                    href={selectedProduct.linkURL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full py-3 px-4 text-center font-bold text-white rounded-xl transition-transform hover:scale-[1.02] active:scale-100"
                     style={{
                       backgroundColor: profile?.buttonColor || '#2563eb'
                    }}
                  >
                    Ver Producto / Comprar
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Lightbox Modal de Galería */}
        {lightboxOpen && lightboxImages.length > 0 && (
          <div className="fixed inset-0 bg-black bg-opacity-90 flex items-center justify-center z-[10000]" onClick={closeLightbox}>
            <div className="relative max-w-4xl max-h-full p-4" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={closeLightbox}
                className="absolute top-2 right-2 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75 transition z-10"
              >
                ✕
              </button>
              {lightboxImages.length > 1 && (
                <button
                  onClick={goToPrevious}
                  className="absolute left-2 top-1/2 transform -translate-y-1/2 text-white bg-black bg-opacity-50 rounded-full p-3 hover:bg-opacity-75 transition z-10"
                >
                  ‹
                </button>
              )}
              {lightboxImages.length > 1 && (
                <button
                  onClick={goToNext}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 text-white bg-black bg-opacity-50 rounded-full p-3 hover:bg-opacity-75 transition z-10"
                >
                  ›
                </button>
              )}
              <img
                src={lightboxImages[currentImageIndex]}
                alt={`Imagen de galería ${currentImageIndex + 1}`}
                className="max-w-full max-h-full object-contain"
              />
              {lightboxImages.length > 1 && (
                <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black bg-opacity-50 px-3 py-1 rounded-full text-sm">
                  {currentImageIndex + 1} / {lightboxImages.length}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (profile?.theme === 'realty') {
    return (
      <div className="public-profile-container">
        {currentUser && (
          <div className="fixed top-4 left-4 z-[999]">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-full text-xs flex items-center space-x-1.5 shadow-xl transition border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span>Dashboard</span>
            </button>
          </div>
        )}
        <React.Suspense fallback={<TemplateFallback />}>
        <ProfileRealtyTemplate
          profile={profile}
          links={links}
          onLinkClick={handleLinkClick}
          currentUser={currentUser}
          visitorProfile={visitorProfile}
          userId={userId}
          downloadVCard={downloadVCard}
          handleShare={handleShare}
          setShowQRModal={setShowQRModal}
          isVCardLoading={isVCardLoading}
          handleStartChat={handleStartChat}
          isStartingChat={isStartingChat}
        />
        </React.Suspense>

        {/* QR Modal */}
        {showQRModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowQRModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Código QR</h3>
                <button onClick={() => setShowQRModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  <FaTimes size={20} />
                </button>
              </div>
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg" ref={qrWrapperRef}>
                  <QRCodeCanvas value={window.location.href} size={256} level="H" includeMargin bgColor="#ffffff" />
                </div>
                <button type="button" onClick={handleDownloadQR} className="mt-4 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-400">
                  Descargar QR (PNG)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (profile?.theme === 'sublima') {
    return (
      <div className="public-profile-container">
        {currentUser && (
          <div className="fixed top-4 left-4 z-[999]">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-full text-xs flex items-center space-x-1.5 shadow-xl transition border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span>Dashboard</span>
            </button>
          </div>
        )}
        <React.Suspense fallback={<TemplateFallback />}>
        <ProfileSublimaTemplate
          profile={profile}
          links={links}
          onLinkClick={handleLinkClick}
          currentUser={currentUser}
          visitorProfile={visitorProfile}
          userId={userId}
          downloadVCard={downloadVCard}
          handleShare={handleShare}
          setShowQRModal={setShowQRModal}
          isVCardLoading={isVCardLoading}
          handleStartChat={handleStartChat}
          isStartingChat={isStartingChat}
        />
        </React.Suspense>

        {/* QR Modal */}
        {showQRModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowQRModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Código QR</h3>
                <button onClick={() => setShowQRModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  <FaTimes size={20} />
                </button>
              </div>
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg" ref={qrWrapperRef}>
                  <QRCodeCanvas value={window.location.href} size={256} level="H" includeMargin bgColor="#ffffff" />
                </div>
                <button type="button" onClick={handleDownloadQR} className="mt-4 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-400">
                  Descargar QR (PNG)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (profile?.theme === 'stage') {
    return (
      <div className="public-profile-container">
        {currentUser && (
          <div className="fixed top-4 left-4 z-[999]">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white/80 hover:text-white font-medium px-3 py-1.5 rounded-full text-xs flex items-center space-x-1.5 shadow-xl transition border border-white/10"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
              <span>Dashboard</span>
            </button>
          </div>
        )}
        <React.Suspense fallback={<TemplateFallback />}>
        <ProfileStageTemplate
          profile={profile}
          links={links}
          onLinkClick={handleLinkClick}
          onSelectProduct={setSelectedProduct}
          onOpenLeadForm={() => setShowLeadForm(true)}
          currentUser={currentUser}
          visitorProfile={visitorProfile}
          userId={userId}
          downloadVCard={downloadVCard}
          handleShare={handleShare}
          setShowQRModal={setShowQRModal}
          isVCardLoading={isVCardLoading}
          handleStartChat={handleStartChat}
          isStartingChat={isStartingChat}
        />
        </React.Suspense>

        {/* QR Modal */}
        {showQRModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={() => setShowQRModal(false)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Código QR</h3>
                <button onClick={() => setShowQRModal(false)} className="text-gray-500 hover:text-gray-700 dark:text-gray-400">
                  <FaTimes size={20} />
                </button>
              </div>
              <div className="flex flex-col items-center">
                <div className="bg-white p-4 rounded-lg" ref={qrWrapperRef}>
                  <QRCodeCanvas value={window.location.href} size={256} level="H" includeMargin bgColor="#ffffff" />
                </div>
                <button type="button" onClick={handleDownloadQR} className="mt-4 px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-400">
                  Descargar QR (PNG)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Detalle de Producto (Merch) */}
        {selectedProduct && (
          <div
            className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm"
            onClick={() => setSelectedProduct(null)}
          >
            <div
              className="bg-gray-900 w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl relative max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              <button onClick={() => setSelectedProduct(null)} className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center">
                <FaTimes />
              </button>
              {selectedProduct.imageURL && (
                <img src={selectedProduct.imageURL} alt={selectedProduct.name} className="w-full h-64 object-cover" />
              )}
              <div className="p-6 overflow-y-auto">
                <h3 className="text-2xl font-black text-white">{selectedProduct.name}</h3>
                {selectedProduct.price && <p className="text-xl font-black text-cyan-400 mt-1">{selectedProduct.price}</p>}
                {(selectedProduct.longDescription || selectedProduct.shortDescription) && (
                  <p className="text-white/60 text-sm mt-3 whitespace-pre-wrap">{selectedProduct.longDescription || selectedProduct.shortDescription}</p>
                )}
                {profile?.whatsapp && (
                  <a
                    href={`https://wa.me/${profile.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Quiero comprar: ${selectedProduct.name}`)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="mt-5 w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-black uppercase tracking-wider bg-cyan-400 text-black"
                  >
                    Comprar por WhatsApp
                  </a>
                )}
                {selectedProduct.linkURL && (
                  <a href={selectedProduct.linkURL} target="_blank" rel="noopener noreferrer"
                    className="mt-2 w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold border border-white/15 text-white">
                    Ver más
                  </a>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Acento de marca para el rediseño "brutal" del perfil por defecto
  const accent = profile?.buttonColor || '#ff6b35';

  return (
    <div className="public-profile-container relative">
      {/* Film grain overlay */}
      <div className="cinema-grain" aria-hidden="true" />

      <div
        className="min-h-screen relative overflow-hidden"
        style={{
          backgroundColor: profile?.backgroundColor || '#080604',
          color: profile?.textColor || '#FFFFFF',
          fontFamily: profile?.fontFamily || "'Space Grotesk', sans-serif",
          ['--accent' as any]: accent,
        }}
      >
        {/* Halo ambiental estático y sutil — profundidad premium sin animación */}
        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div
            className="brutal-orb"
            style={{
              top: '-20%', left: '50%', transform: 'translateX(-50%)',
              width: '80vw', height: '55vw', maxWidth: 640, maxHeight: 440,
              background: `radial-gradient(ellipse, ${accent}, transparent 70%)`,
              opacity: 0.16,
            }}
          />
        </div>

        {/* Botón de volver al Dashboard */}
        {currentUser && ((currentUser as any).id === userId || (currentUser as any).uid === userId) && (
          <div className="absolute top-4 left-4 z-20">
            <button
              onClick={() => navigate('/dashboard')}
              className="bg-black/50 backdrop-blur-sm text-white/70 hover:text-white px-3 py-1.5 rounded-full text-xs flex items-center space-x-1.5 border border-white/10 transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Dashboard</span>
            </button>
          </div>
        )}

        {/* Hero Cinematográfico */}
        <div className="relative z-10 w-full h-64 sm:h-96 overflow-hidden">
          {profile?.coverImageURL ? (
            <>
              <img
                src={profile.coverImageURL}
                alt="Portada del Perfil"
                className="cinema-hero-cover w-full h-full object-cover object-center"
                style={{ filter: 'brightness(0.72) saturate(1.15) contrast(1.05)' }}
              />
              {/* Overlay triple: superior, inferior, lateral */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/25 to-black/50 pointer-events-none" />
              <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-transparent to-black/40 pointer-events-none" />
              {/* Tinte de acento al pie del hero — discreto */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: `linear-gradient(to top, ${accent}1a, transparent 50%)` }} />
            </>
          ) : (
            <div
              className="w-full h-full"
              style={{
                background: `linear-gradient(135deg, #080604 0%, ${accent}22 50%, #0d0704 100%)`,
              }}
            />
          )}
        </div>

        {/* Foto de Perfil — superpuesta al hero */}
        <div className="relative z-10 flex flex-col items-center px-4">
          <div className="-mt-14 sm:-mt-16 z-10">
            {profile?.profilePhotoURL ? (
              <div className="relative">
                <img
                  src={profile.profilePhotoURL}
                  alt="Foto de Perfil"
                  className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-full object-cover"
                  style={{
                    border: `1px solid rgba(255,255,255,0.12)`,
                    boxShadow: `0 0 0 5px ${profile?.backgroundColor || '#080604'}, 0 20px 50px rgba(0,0,0,0.7)`,
                  }}
                />
              </div>
            ) : (
              <div
                className="w-28 h-28 sm:w-32 sm:h-32 rounded-full flex items-center justify-center text-4xl font-semibold relative"
                style={{
                  background: `linear-gradient(135deg, ${accent}33, ${accent}14)`,
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: `0 0 0 5px ${profile?.backgroundColor || '#080604'}, 0 20px 50px rgba(0,0,0,0.7)`,
                }}
              >
                {profile?.displayName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>

          {/* Nombre, Cargo, Empresa, Bio */}
          <h1 className="cinema-animate-in-delay-1 mt-5 text-[26px] sm:text-3xl font-semibold text-center tracking-tight leading-tight">
            {profile?.displayName}
          </h1>
          {(profile?.jobTitle || profile?.company) && (
            <div className="cinema-animate-in-delay-1 mt-2.5 flex items-center gap-2">
              <span className="w-1 h-1 rounded-full" style={{ background: accent }} />
              <span className="text-[11px] font-medium tracking-[0.22em] uppercase" style={{ color: 'rgba(255,255,255,0.55)' }}>
                {profile?.jobTitle
                  ? `${profile.jobTitle}${profile?.company ? ` · ${profile.company}` : ''}`
                  : profile?.company}
              </span>
            </div>
          )}
          {profile?.bio && (
            <p className="cinema-animate-in-delay-2 mt-4 text-center max-w-sm text-sm leading-relaxed tracking-wide opacity-70 px-4">
              {profile.bio}
            </p>
          )}

          {/* Botones de Contacto Principales */}
          {(profile?.phone || profile?.whatsapp || profile?.contactEmail) && (
            <div className="cinema-animate-in-delay-2 flex justify-center gap-3 mt-6">
              {profile?.phone && (
                <a
                  href={`tel:${profile.phone}`}
                  title="Llamar"
                  aria-label="Llamar"
                  className="brutal-accent-btn flex items-center justify-center h-11 w-11 rounded-xl active:scale-95 border border-white/10"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <FaPhoneAlt size={15} />
                </a>
              )}
              {profile?.whatsapp && (
                <a
                  href={`https://wa.me/${profile.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Enviar mensaje por WhatsApp"
                  aria-label="Enviar mensaje por WhatsApp"
                  className="brutal-accent-btn flex items-center justify-center h-11 w-11 rounded-xl active:scale-95 border border-white/10"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <FaWhatsapp size={17} />
                </a>
              )}
              {profile?.contactEmail && (
                <a
                  href={`mailto:${profile.contactEmail}`}
                  title="Enviar correo"
                  aria-label="Enviar correo"
                  className="brutal-accent-btn flex items-center justify-center h-11 w-11 rounded-xl active:scale-95 border border-white/10"
                  style={{ background: 'rgba(255,255,255,0.04)' }}
                >
                  <FaEnvelope size={15} />
                </a>
              )}
            </div>
          )}

          {/* Botones de Acción Secundarios */}
          <div className="cinema-animate-in-delay-3 flex flex-wrap justify-center gap-2 mt-5 px-4">
            <button
              onClick={downloadVCard}
              disabled={isVCardLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all duration-200 hover:scale-[1.03] active:scale-100 border border-white/10 disabled:opacity-40"
              style={{ background: 'rgba(255,255,255,0.06)' }}
              title="Guardar Contacto"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>{isVCardLoading ? '...' : 'Guardar'}</span>
            </button>

            <button
              onClick={handleShare}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs transition-all duration-200 hover:-translate-y-0.5 active:scale-100 border border-white/10"
              style={{ background: 'rgba(255,255,255,0.035)' }}
              title="Compartir Perfil"
            >
              <FaShareAlt size={15} />
              <span>Compartir</span>
            </button>

            <button
              onClick={() => setShowQRModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs transition-all duration-200 hover:-translate-y-0.5 active:scale-100 border border-white/10"
              style={{ background: 'rgba(255,255,255,0.035)' }}
              title="Ver Código QR"
            >
              <FaQrcode size={15} />
              <span>QR</span>
            </button>

            {profile?.plan === 'ultra' && (
              <button
                onClick={() => setShowLeadForm(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm transition-all duration-200 hover:scale-[1.03] active:scale-100 border border-white/10"
                style={{ background: 'rgba(255,255,255,0.06)' }}
                title="Intercambiar Contacto"
              >
                <span className="text-sm">⇄</span>
                <span>Intercambiar</span>
              </button>
            )}

            {/* Enviar Mensaje - Solo ULTRA */}
            {currentUser && visitorProfile?.plan === 'ultra' && userId && ((currentUser as any).id !== userId && (currentUser as any).uid !== userId) && (
              <button
                onClick={handleStartChat}
                disabled={isStartingChat}
                className="flex items-center gap-2 px-4 py-2 bg-white bg-opacity-10 rounded-lg hover:bg-opacity-20 transition border border-white border-opacity-20 disabled:opacity-50"
                title="Enviar Mensaje"
              >
                <FaEnvelope size={18} />
                <span className="text-sm">{isStartingChat ? '...' : 'Mensaje'}</span>
              </button>
            )}
          </div>

          {/* Redes Sociales */}
          {(profile as any)?.sectionVisibility?.social !== false && profile?.socialMedia && Object.keys(profile.socialMedia).some(key => profile.socialMedia?.[key as keyof typeof profile.socialMedia]) && (
            <div className="cinema-animate-in-delay-3 flex justify-center gap-3 mt-6 flex-wrap">
              {profile.socialMedia.instagram && (
                <a 
                  href={`https://instagram.com/${profile.socialMedia.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
                  title="Instagram"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                </a>
              )}
              {profile.socialMedia.twitter && (
                <a 
                  href={`https://twitter.com/${profile.socialMedia.twitter.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
                  title="Twitter/X"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </a>
              )}
              {profile.socialMedia.linkedin && (
                <a 
                  href={`https://linkedin.com/in/${profile.socialMedia.linkedin.replace('in/', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
                  title="LinkedIn"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              )}
              {profile.socialMedia.facebook && (
                <a 
                  href={`https://facebook.com/${profile.socialMedia.facebook}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
                  title="Facebook"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                  </svg>
                </a>
              )}
              {profile.socialMedia.youtube && (
                <a 
                  href={`https://youtube.com/${profile.socialMedia.youtube}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
                  title="YouTube"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                </a>
              )}
              {profile.socialMedia.tiktok && (
                <a 
                  href={`https://tiktok.com/@${profile.socialMedia.tiktok.replace('@', '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
                  title="TikTok"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
                  </svg>
                </a>
              )}
              {profile.socialMedia.github && (
                <a 
                  href={`https://github.com/${profile.socialMedia.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
                  title="GitHub"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
                  </svg>
                </a>
              )}
              {profile.socialMedia.website && (
                <a 
                  href={profile.socialMedia.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-9 h-9 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 border border-white/10" style={{ background: 'rgba(255,255,255,0.04)', backdropFilter: 'blur(12px)' }}
                  title="Website"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                  </svg>
                </a>
              )}
            </div>
          )}

          {/* Ubicaciones si existen */}
          {locationsToShow.length > 0 && (
            <div className="flex justify-center mt-4">
              <div className="flex flex-col items-center gap-2">
                {locationsToShow.map((loc, index) => (
                  <a
                    key={`${loc}-${index}`}
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm opacity-80 hover:opacity-100 transition"
                  >
                    <FaMapMarkerAlt size={16} />
                    <span>{loc}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Contenedor de Secciones */}
        <div className="relative z-10 w-full max-w-2xl mx-auto px-4 mt-8 space-y-4 cinema-animate-in-delay-4">
          {profile?.aboutMe && profile.aboutMe.trim() && (
            <div className="brutal-card p-6">
              <p className="brutal-label mb-3">Sobre mí</p>
              <p className="text-sm leading-relaxed opacity-85">{profile.aboutMe}</p>
            </div>
          )}

          {profile?.bookingLink && (profile?.plan === 'pro' || profile?.plan === 'ultra') && (
            <a
              href={profile.bookingLink}
              target="_blank"
              rel="noopener noreferrer"
              className={`block w-full py-3.5 text-center font-semibold text-sm tracking-wide transition-all hover:-translate-y-0.5 active:scale-100 ${
                profile?.buttonStyle === 'sharp'
                  ? 'rounded-none'
                  : profile?.buttonStyle === 'pills'
                  ? 'rounded-full'
                  : 'rounded-xl'
              }`}
              style={{
                backgroundColor: profile?.buttonColor || '#ff6b35',
                color: profile?.buttonTextColor || '#ffffff',
                borderWidth: `${profile?.borderWidth ?? 0}px`,
                borderStyle: 'solid',
                borderColor: profile?.borderColor || 'transparent',
                boxShadow:
                  profile?.shadow === 'soft'
                    ? '0 8px 24px rgba(0,0,0,0.4)'
                    : profile?.shadow === 'hard'
                    ? '0 16px 40px rgba(0,0,0,0.6)'
                    : `0 8px 24px ${(profile?.buttonColor || '#ff6b35')}44`,
              }}
            >
              📅 Agendar una cita
            </a>
          )}

          {sectionsToRender.map(renderSection)}
        </div>


        {/* Footer */}
        <div className="relative z-10 w-full max-w-2xl mx-auto px-4 mt-16 mb-10">
          {profile?.logoURL && (
            <div className="text-center mb-6">
              <img
                src={profile.logoURL}
                alt="Logo"
                className="h-8 object-contain mx-auto opacity-30"
              />
            </div>
          )}
          {(!profile?.plan || profile?.plan === 'conecta') && (
            <div className="text-center">
              <p className="text-[10px] tracking-widest uppercase opacity-20">Powered by Connexo</p>
            </div>
          )}
        </div>
      </div>

      {/* Lightbox Modal para Galería - MOVIDO AL FINAL */}

      {openAlbum && (
        <div
          className="fixed inset-0 z-[9998] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm"
          onClick={() => setOpenAlbum(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] bg-[var(--card-background)] rounded-2xl overflow-hidden shadow-2xl border border-white/10 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setOpenAlbum(null)}
                className="px-3 py-2 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition"
              >
                Volver
              </button>
              <h3 className="text-lg font-bold truncate px-4">{openAlbum?.title || 'Álbum'}</h3>
              <div className="w-20" />
            </div>

            <div className="p-4 overflow-y-auto">
              {Array.isArray(openAlbum?.images) && openAlbum.images.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {openAlbum.images.map((imgUrl: string, idx: number) => (
                    <button
                      key={`${imgUrl}_${idx}`}
                      type="button"
                      className="aspect-square rounded-lg overflow-hidden border border-white/10 hover:opacity-90 transition"
                      onClick={() => openLightbox(idx, openAlbum.images)}
                    >
                      <img src={imgUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-center text-[var(--text-secondary)] py-10">Este álbum no tiene fotos aún.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Testimonio */}
      {testimonialModal}

      {/* Modal Intercambiar Contacto */}
      {showLeadForm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-gray-950/95 border border-white/10 p-6 rounded-2xl shadow-2xl w-full max-w-md text-white cinema-animate-in">
            <h3 className="text-lg font-semibold tracking-wide mb-5">Intercambiar Contacto</h3>
            <form onSubmit={handleSubmitLead}>
              <div className="mb-4">
                <label className="block text-xs tracking-widest uppercase opacity-40 mb-2">Tu Nombre</label>
                <input
                  required
                  type="text"
                  value={leadData.name}
                  onChange={(e) => setLeadData(prev => ({...prev, name: e.target.value}))}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none text-sm transition"
                  placeholder="Nombre completo"
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs tracking-widest uppercase opacity-40 mb-2">Email</label>
                <input
                  required
                  type="email"
                  value={leadData.email}
                  onChange={(e) => setLeadData(prev => ({...prev, email: e.target.value}))}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none text-sm transition"
                  placeholder="tu@email.com"
                />
              </div>
              <div className="mb-4">
                <label className="block text-xs tracking-widest uppercase opacity-40 mb-2">Teléfono (Opcional)</label>
                <input
                  type="tel"
                  value={leadData.phone}
                  onChange={(e) => setLeadData(prev => ({...prev, phone: e.target.value}))}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none text-sm transition"
                  placeholder="+56 9 1234 5678"
                />
              </div>
              <div className="mb-5">
                <label className="block text-xs tracking-widest uppercase opacity-40 mb-2">Mensaje (Opcional)</label>
                <textarea
                  rows={3}
                  value={leadData.notes}
                  onChange={(e) => setLeadData(prev => ({...prev, notes: e.target.value}))}
                  className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-white/30 focus:outline-none text-sm resize-none transition"
                  placeholder="¿En qué podemos ayudarte?"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowLeadForm(false)}
                  disabled={isSubmittingLead}
                  className="px-4 py-2 rounded-xl text-sm opacity-50 hover:opacity-80 transition border border-white/10 disabled:opacity-30"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingLead}
                  className="px-5 py-2 rounded-xl text-sm font-semibold transition"
                  style={{ backgroundColor: profile?.buttonColor || '#ff6600', color: profile?.buttonTextColor || '#fff' }}
                >
                  {isSubmittingLead ? 'Enviando...' : 'Enviar'}
                </button>
              </div>
              <p className="text-[10px] text-white/25 text-center mt-4 leading-relaxed">
                Datos compartidos exclusivamente con {profile?.displayName || 'el propietario'}. <a href="https://www.connexo.tech/privacidad" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/50 transition">Política de Privacidad</a>.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Modal QR */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={() => setShowQRModal(false)}>
          <div className="bg-gray-950/95 border border-white/10 rounded-2xl p-6 max-w-sm w-full cinema-animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <p className="text-xs tracking-widest uppercase opacity-40">Código QR</p>
              <button onClick={() => setShowQRModal(false)} className="opacity-30 hover:opacity-70 transition">
                <FaTimes size={16} />
              </button>
            </div>
            <div className="flex flex-col items-center">
              <div className="bg-white p-4 rounded-xl" ref={qrWrapperRef}>
                <QRCodeCanvas
                  value={window.location.href}
                  size={220}
                  level="H"
                  includeMargin={false}
                  bgColor="#ffffff"
                />
              </div>
              <p className="text-xs text-white/30 mt-4 text-center break-all px-2">{window.location.href}</p>
              <button
                type="button"
                onClick={handleDownloadQR}
                className="mt-4 px-5 py-2 text-sm font-medium rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
              >
                Descargar PNG
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedProduct && (
        <div
          className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-md"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl relative max-h-[85vh] sm:max-h-[90vh] flex flex-col overflow-hidden cinema-animate-in"
            onClick={(e) => e.stopPropagation()}
            style={{
               backgroundColor: profile?.backgroundColor || '#0d0d0d',
               color: profile?.textColor || '#ffffff',
               border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <div className="relative shrink-0">
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-3 right-3 z-10 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              {selectedProduct.imageURL && (
                <img
                  src={selectedProduct.imageURL}
                  alt={selectedProduct.name}
                  className="w-full h-48 sm:h-64 object-cover"
                  style={{ filter: 'brightness(0.85)' }}
                />
              )}
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <h2 className="text-xl font-bold tracking-wide mb-2">{selectedProduct.name}</h2>
              {selectedProduct.price && (
                <p className="text-lg font-semibold mb-4 opacity-80" style={{ color: profile?.buttonColor || '#ff6600' }}>
                  {selectedProduct.price}
                </p>
              )}
              <div className="text-sm leading-relaxed opacity-75 whitespace-pre-wrap">
                {selectedProduct.longDescription || selectedProduct.shortDescription || "Sin descripción detallada."}
              </div>
            </div>

            {selectedProduct.linkURL && (
              <div className="p-4 border-t border-white/10 shrink-0">
                <a
                  href={selectedProduct.linkURL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block w-full py-3 px-4 text-center font-bold rounded-2xl transition-all hover:scale-[1.02] active:scale-100 tracking-wide"
                  style={{
                    backgroundColor: profile?.buttonColor || '#ff6600'
                 }}
                >
                  Ver Producto / Comprar
                </a>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Footer secundario — ya está dentro del div principal, este es redundante */}

      {/* Lightbox cinematográfico */}
      {lightboxOpen && lightboxImages.length > 0 && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-[10000]" onClick={closeLightbox}>
          <div className="relative w-full max-w-4xl max-h-full p-4" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={closeLightbox}
              className="absolute top-2 right-2 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-2.5 transition z-10 border border-white/10"
            >
              <FaTimes size={14} />
            </button>
            {lightboxImages.length > 1 && (
              <button
                onClick={goToPrevious}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-3 transition z-10 border border-white/10 text-2xl"
              >
                ‹
              </button>
            )}
            {lightboxImages.length > 1 && (
              <button
                onClick={goToNext}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-white/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-3 transition z-10 border border-white/10 text-2xl"
              >
                ›
              </button>
            )}
            <img
              src={lightboxImages[currentImageIndex]}
              alt={`Imagen de galería ${currentImageIndex + 1}`}
              className="max-w-full max-h-full object-contain"
            />

            {/* Indicador de posición */}
            {lightboxImages.length > 1 && (
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white bg-black bg-opacity-50 px-3 py-1 rounded-full text-sm">
                {currentImageIndex + 1} / {lightboxImages.length}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PublicProfile;