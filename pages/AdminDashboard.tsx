import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Notification, Card, Input, Badge, KPICard } from '../components/ui';
import { QRScannerModal } from '../components/QRScannerModal';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { NotificationCenter } from '../components/NotificationCenter';
// Pestañas cargadas bajo demanda: solo se descarga el chunk de la pestaña activa
const LinksTab = React.lazy(() => import('../components/tabs/LinksTab').then(m => ({ default: m.LinksTab })));
const AppearanceTab = React.lazy(() => import('../components/tabs/AppearanceTab').then(m => ({ default: m.AppearanceTab })));
const AnalyticsTab = React.lazy(() => import('../components/tabs/AnalyticsTab').then(m => ({ default: m.AnalyticsTab })));
const AccountTab = React.lazy(() => import('../components/tabs/AccountTab').then(m => ({ default: m.AccountTab })));
const OrdersTab = React.lazy(() => import('../components/tabs/OrdersTab').then(m => ({ default: m.OrdersTab })));
const EcomOrdersTab = React.lazy(() => import('../components/tabs/EcomOrdersTab').then(m => ({ default: m.EcomOrdersTab })));
const EcomLoyaltyTab = React.lazy(() => import('../components/tabs/EcomLoyaltyTab').then(m => ({ default: m.EcomLoyaltyTab })));
const EcomProductsTab = React.lazy(() => import('../components/tabs/EcomProductsTab').then(m => ({ default: m.EcomProductsTab })));
const EcomAppointmentsTab = React.lazy(() => import('../components/tabs/EcomAppointmentsTab').then(m => ({ default: m.EcomAppointmentsTab })));
const LoyaltyTab = React.lazy(() => import('../components/tabs/LoyaltyTab').then(m => ({ default: m.LoyaltyTab })));
const BarberLoyaltyTab = React.lazy(() => import('../components/tabs/BarberLoyaltyTab').then(m => ({ default: m.BarberLoyaltyTab })));
const BarberServicesTab = React.lazy(() => import('../components/tabs/BarberServicesTab').then(m => ({ default: m.BarberServicesTab })));
const BarberProductsTab = React.lazy(() => import('../components/tabs/BarberProductsTab').then(m => ({ default: m.BarberProductsTab })));
const BarberReservationsTab = React.lazy(() => import('../components/tabs/BarberReservationsTab').then(m => ({ default: m.BarberReservationsTab })));
const GastroMenuTab = React.lazy(() => import('../components/tabs/GastroMenuTab').then(m => ({ default: m.GastroMenuTab })));
const GastroReservationsTab = React.lazy(() => import('../components/tabs/GastroReservationsTab').then(m => ({ default: m.GastroReservationsTab })));
const GastroInventoryTab = React.lazy(() => import('../components/tabs/GastroInventoryTab').then(m => ({ default: m.GastroInventoryTab })));
const StageFansTab = React.lazy(() => import('../components/tabs/StageFansTab').then(m => ({ default: m.StageFansTab })));
const StageReleasesTab = React.lazy(() => import('../components/tabs/StageReleasesTab').then(m => ({ default: m.StageReleasesTab })));
const StageTourTab = React.lazy(() => import('../components/tabs/StageTourTab').then(m => ({ default: m.StageTourTab })));
const StagePressTab = React.lazy(() => import('../components/tabs/StagePressTab').then(m => ({ default: m.StagePressTab })));
const RealtyPropertiesTab = React.lazy(() => import('../components/tabs/RealtyPropertiesTab').then(m => ({ default: m.RealtyPropertiesTab })));
const RealtyAgentsTab = React.lazy(() => import('../components/tabs/RealtyAgentsTab').then(m => ({ default: m.RealtyAgentsTab })));
const RealtyLeadsTab = React.lazy(() => import('../components/tabs/RealtyLeadsTab').then(m => ({ default: m.RealtyLeadsTab })));
const RealtyLoyaltyTab = React.lazy(() => import('../components/tabs/RealtyLoyaltyTab').then(m => ({ default: m.RealtyLoyaltyTab })));
const SublimaProductsTab = React.lazy(() => import('../components/tabs/SublimaProductsTab').then(m => ({ default: m.SublimaProductsTab })));
const SublimaOrdersTab = React.lazy(() => import('../components/tabs/SublimaOrdersTab').then(m => ({ default: m.SublimaOrdersTab })));
const SublimaLoyaltyTab = React.lazy(() => import('../components/tabs/SublimaLoyaltyTab').then(m => ({ default: m.SublimaLoyaltyTab })));
const GalleryTab = React.lazy(() => import('../components/tabs/GalleryTab').then(m => ({ default: m.GalleryTab })));
const ContactsTab = React.lazy(() => import('../components/ContactsTab').then(m => ({ default: m.ContactsTab })));
import { TestimonialFormModal } from '../components/TestimonialFormModal';
import { OnboardingTour, type TourStep } from '../components/OnboardingTour';
import { useOnboarding } from '../hooks/useOnboarding';
import type { UserLink, Testimonial } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { supabase } from '../src/lib/supabase';
import { getOwnerTimeZone } from '../src/lib/analytics';
import { pushMultiAccountEnabled, releasePushDevice } from '../src/lib/push';
import { Link, Palette, BarChart3, UserIcon, Users, MessageCircle, QrCode, ExternalLink, LogOut, Save, Eye, Utensils, ShoppingBag, Package, Music, Ticket, Heart, FolderOpen, CalendarCheck, Boxes, ClipboardList, Building2, UserCog, Shirt, Scissors, Images, HelpCircle } from 'lucide-react';
const ChatList = React.lazy(() => import('../components/chat/ChatList'));
const ChatWindow = React.lazy(() => import('../components/chat/ChatWindow'));

const TabSpinner = () => (
  <div className="flex items-center justify-center py-24">
    <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-[var(--primary-orange)]"></div>
  </div>
);

type Tab = 'links' | 'gallery' | 'appearance' | 'analytics' | 'account' | 'contacts' | 'chat' | 'orders' | 'ecom_orders' | 'ecom_loyalty' | 'ecom_products' | 'ecom_appointments' | 'loyalty' | 'menu' | 'reservations' | 'inventory' | 'services' | 'barber_products' | 'barber_reservations' | 'stage_fans' | 'stage_releases' | 'stage_tour' | 'stage_press' | 'realty_properties' | 'realty_agents' | 'realty_leads' | 'realty_loyalty' | 'sublima_products' | 'sublima_orders' | 'sublima_loyalty';

const LAST_TAB_KEY = 'cnx_dashboard_tab';

const AdminDashboard: React.FC<{ user: any }> = ({ user }) => {
    const [activeTab, setActiveTab] = useState<Tab>(() => {
        const saved = localStorage.getItem(LAST_TAB_KEY) as Tab | null;
        const valid: Tab[] = ['links', 'gallery', 'appearance', 'analytics', 'account', 'contacts', 'chat', 'orders', 'ecom_orders', 'ecom_loyalty', 'ecom_products', 'ecom_appointments', 'loyalty', 'menu', 'reservations', 'inventory', 'services', 'barber_products', 'barber_reservations', 'stage_fans', 'stage_releases', 'stage_tour', 'stage_press', 'realty_properties', 'realty_agents', 'realty_leads', 'realty_loyalty', 'sublima_products', 'sublima_orders', 'sublima_loyalty'];
        // Las notificaciones push traen la pestaña destino en la URL
        // (ej. '?tab=ecom_appointments'): al tocar la alerta se abre justo ahí.
        try {
            const fromUrl = new URLSearchParams(window.location.search).get('tab') as Tab | null;
            if (fromUrl && valid.includes(fromUrl)) return fromUrl;
        } catch { /* noop */ }
        return saved && valid.includes(saved) ? saved : 'links';
    });
    const [links, setLinks] = useState<UserLink[]>([]);
    const [leads, setLeads] = useState<any[]>([]);
    const [analyticsData, setAnalyticsData] = useState<any>(null);
    const [profileData, setProfileData] = useState<any>({
        displayName: '', bio: '', aboutMe: '', profilePhotoURL: '',
        coverImageURL: '', jobTitle: '', company: '',
        username: '', email: '', plan: 'free', theme: 'default',
        showSchedule: false, darkMode: false, logoURL: '', contactEmail: '',
        phone: '', location: '', locations: [], whatsapp: '',
        bookingLink: '', tableCount: 0, paymentLink: '',
        backgroundColor: '#210900',
        buttonColor: '#ff6b35',
        buttonTextColor: '#ffffff',
        buttonStyle: 'rounded',
        borderColor: '#ff6b35',
        borderWidth: 0,
        shadow: 'none',
        textColor: '#ffffff',
        fontFamily: 'Inter, sans-serif',
        businessHours: [],
        products: [],
        galleryMode: 'grid',
        albums: [],
        galleryImageURLs: [],
        featuredVideoURL: '',
        uploadedVideoURL: '',
        galleryTitle: 'Galería',
        testimonials: [],
        socialMedia: {},
        digitalFiles: [],
        faqs: [],
        sectionOrder: [
            { type: 'video', enabled: true, order: 0 },
            { type: 'links', enabled: true, order: 1 },
            { type: 'products', enabled: true, order: 2 },
            { type: 'gallery', enabled: true, order: 3 },
            { type: 'files', enabled: false, order: 4 },
            { type: 'testimonials', enabled: true, order: 5 },
            { type: 'faqs', enabled: false, order: 6 },
            { type: 'schedule', enabled: true, order: 7 },
        ],
    });
    const [isProfileLoading, setIsProfileLoading] = useState(true);
    const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [suggestionTargetField, setSuggestionTargetField] = useState<string | null>(null);
    const [pendingTestimonials, setPendingTestimonials] = useState<any[]>([]); // Usamos 'any' por simplicidad ahora
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useLanguage();

    // Estados para el lightbox de galería
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Estados para gestión de testimonios
    const [isTestimonialFormOpen, setIsTestimonialFormOpen] = useState(false);
    const [editingTestimonial, setEditingTestimonial] = useState<Testimonial | null>(null);
    const [testimonialForm, setTestimonialForm] = useState({
        quote: '',
        author: '',
        authorTitle: '',
        authorImageURL: ''
    });

    // Estados para cuenta
    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
    });
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [subscription, setSubscription] = useState<any>(null);
    const normalizedPlan = (profileData?.plan ?? 'conecta').toString().toLowerCase();
    const effectivePlan = normalizedPlan === 'free' ? 'conecta' : normalizedPlan;

    // Persistir tab activa en localStorage
    useEffect(() => {
        localStorage.setItem(LAST_TAB_KEY, activeTab);
    }, [activeTab]);

    // Suscripción en tiempo real del usuario
    useEffect(() => {
        if (!user?.id) return;
        supabase
            .from('subscriptions')
            .select('account_status, plan_type, trial_ends_at, source_campaign, converted_at')
            .eq('user_id', user.id)
            .maybeSingle()
            .then(({ data }) => { if (data) setSubscription(data); });
    }, [user?.id]);

    // Helpers para el badge de suscripción
    const subDaysLeft = subscription?.trial_ends_at
        ? Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / 86400000)
        : null;
    const subIsExpired = subscription?.account_status === 'expired'
        || (subscription?.account_status === 'trial' && subDaysLeft !== null && subDaysLeft <= 0);
    const subIsTrialUrgent = !subIsExpired && subscription?.account_status === 'trial' && subDaysLeft !== null && subDaysLeft <= 14;
    // Próxima fecha de cobro (calculada a partir de converted_at)
    const subNextBilling: Date | null = (() => {
        if (!subscription || subscription.account_status !== 'active' || !subscription.converted_at) return null;
        const origin = new Date(subscription.converted_at);
        const today = new Date();
        const next = new Date(origin);
        if (subscription.plan_type === 'anual_pago') {
            while (next <= today) next.setFullYear(next.getFullYear() + 1);
        } else {
            while (next <= today) next.setMonth(next.getMonth() + 1);
        }
        return next;
    })();
    const CONNEXO_SUPPORT_WA = '584226469177';

    // Effect 1: Core Profile Loading
    useEffect(() => {
        if (!user?.id) {
            setIsProfileLoading(false);
            return;
        }

        // Si ya tenemos datos, no repetir el fetch principal de perfil
        if (profileData.displayName) {
            setIsProfileLoading(false);
            return;
        }

        setIsProfileLoading(true);
        console.log("Dashboard: Fetching core profile for", user.id);
        
        Promise.resolve(supabase.from('profiles').select('*').eq('id', user.id).single())
            .then(({ data, error }) => {
                if (data && !error) {
                    setProfileData(prev => ({
                        ...prev,
                        ...data,
                        plan: data.plan ? data.plan.toLowerCase() : 'conecta'
                    }) as any);
                }
            })
            .catch(err => console.error("Dashboard: Error loading profile", err))
            .finally(() => setIsProfileLoading(false));
    }, [user?.id]);

    // Effect 2: Ancillary Data (Testimonials & Leads)
    useEffect(() => {
        if (!user?.id) return;

        console.log("Dashboard: Fetching ancillary data for", user.id);

        Promise.resolve(supabase.from('pending_testimonials').select('*').eq('userId', user.id))
            .then(({ data, error }) => {
                if (data && !error) setPendingTestimonials(data);
            })
            .catch(err => console.error("Dashboard: Error fetching testimonials", err));

        Promise.resolve(supabase.from('leads').select('*').eq('userId', user.id))
            .then(({ data, error }) => {
                if (data && !error) {
                    setLeads(data.map((l: any) => ({
                        id: l.id,
                        userId: l.userId,
                        visitorName: l.name,
                        visitorEmail: l.email,
                        visitorPhone: l.phone,
                        visitorNotes: l.notes || '',
                        capturedAt: l.created_at
                    })));
                }
            })
            .catch(err => console.error("Dashboard: Error fetching leads", err));
    }, [user?.id]);


    // Effect 4: Analytics Processing
    //
    // Antes esto leía profileData.totalViews / .totalClicks / .analytics y
    // link.clicks — CUATRO campos que no existen en la base (y `link.clicks`
    // ni siquiera era el nombre real de la columna, que es `clickCount`).
    // Resultado: la pestaña mostraba ceros en las 9 plantillas, siempre.
    // Ahora se agrega en el servidor. Ver setup_analytics.sql.
    useEffect(() => {
        if (!user?.id) return;
        let cancelled = false;

        (async () => {
            const { data, error } = await supabase.rpc('get_profile_analytics', {
                p_owner_id: user.id,
                p_days: 90,
                p_tz: getOwnerTimeZone(),
            });
            if (cancelled) return;

            if (error) {
                // Si aún no se ejecutó el SQL, la pestaña se dibuja en cero en
                // vez de quedarse colgada. El aviso queda en consola.
                console.error('Analytics RPC error:', error.message);
                setAnalyticsData({
                    totalViews: 0, totalClicks: 0, linkDetails: [],
                    deviceBreakdown: { mobile: 0, desktop: 0 },
                    topReferrers: [], heatmap: [], missingSetup: true,
                });
                return;
            }

            const perLink = (data?.linkClicks || {}) as Record<string, number>;
            setAnalyticsData({
                totalViews: Number(data?.totalViews) || 0,
                totalClicks: Number(data?.totalClicks) || 0,
                linkDetails: links.map(link => ({
                    id: link.id,
                    title: link.title || '',
                    clickCount: Number(perLink[link.id]) || 0,
                })).sort((a, b) => b.clickCount - a.clickCount),
                deviceBreakdown: {
                    mobile: Number(data?.devices?.mobile) || 0,
                    desktop: Number(data?.devices?.desktop) || 0,
                },
                topReferrers: Array.isArray(data?.referrers) ? data.referrers : [],
                heatmap: Array.isArray(data?.heatmap) ? data.heatmap : [],
            });
        })();

        return () => { cancelled = true; };
    }, [user?.id, links]);

    useEffect(() => {
      const state = location.state as { openChatId?: string } | null;
      if (state?.openChatId) {
        setActiveTab('chat');
        setSelectedChatId(state.openChatId);
        navigate('.', { replace: true, state: {} });
      }
    }, [location.state, navigate]);

    const showNotification = (message: string, type: 'success' | 'error') => {
        setNotification({ message, type });
    };

    const generateCopy = async (type: 'bio' | 'title', targetField: string, keywords?: string) => {
        if (profileData?.plan !== 'pro' && profileData?.plan !== 'ultra') {
            alert('El generador de copy es una función PRO. ¡Actualiza tu plan!');
            return;
        }
        
        console.log(`Solicitando sugerencias para '${type}' con keywords: '${keywords}'`);
        setIsGenerating(true);
        setSuggestions([]);
        setSuggestionTargetField(targetField);

        try {
            const { data, error } = await supabase.functions.invoke('generateCopySuggestions', {
                body: { type: type, keywords: keywords }
            });
            
            const result = { data };
            
            if (result.data?.suggestions && Array.isArray(result.data.suggestions)) {
                console.log("Sugerencias recibidas:", result.data.suggestions);
                setSuggestions(result.data.suggestions);
            } else {
                console.error("Respuesta inesperada de la función:", result.data);
                setSuggestions(["Error en formato de respuesta"]);
            }

        } catch (error: any) {
            console.error("Error al llamar la función 'generateCopySuggestions':", error?.message || 'Ocurrió un error desconocido');
            const errorMessage = error?.message || 'Ocurrió un error desconocido al generar.';
            alert(`Error al generar sugerencias: ${errorMessage}`);
            setSuggestions([]);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveProfile = async () => {
        if (!user) return;
        try {
            const sanitizedProfileData: Record<string, any> = {
                ...profileData,
                galleryMode: profileData?.plan === 'ultra' ? (profileData.galleryMode || 'grid') : 'grid'
            };

            // Guardado resiliente: si la tabla `profiles` no tiene alguna columna,
            // PostgREST falla TODO el upsert. En vez de perder todos los cambios,
            // detectamos la columna faltante, la quitamos y reintentamos. Así el
            // resto de los datos sí se guarda (y avisamos qué columna falta).
            let payload: Record<string, any> = { id: user.id, ...sanitizedProfileData };
            const skipped: string[] = [];
            for (let attempt = 0; attempt < 25; attempt++) {
                const { error: saveError } = await supabase.from('profiles').upsert(payload);
                if (!saveError) {
                    if (skipped.length > 0) {
                        console.warn('Columnas omitidas al guardar (faltan en la BD):', skipped);
                    }
                    showNotification(t('notification_changes_saved_success'), 'success');
                    return;
                }
                // Buscar el nombre de la columna inexistente en el mensaje de error.
                const msg = saveError.message || '';
                const m =
                    msg.match(/Could not find the '([^']+)' column/i) ||
                    msg.match(/column "?([A-Za-z0-9_]+)"? of relation/i) ||
                    msg.match(/'([^']+)' column of 'profiles'/i);
                const col = m?.[1];
                if (col && Object.prototype.hasOwnProperty.call(payload, col) && col !== 'id') {
                    delete payload[col];
                    skipped.push(col);
                    continue;
                }
                throw saveError;
            }
            throw new Error('No se pudo guardar tras varios intentos.');
        } catch (error: any) {
            console.error('Error al guardar perfil:', error?.message || error || 'Ocurrió un error desconocido');
            showNotification(t('notification_changes_saved_error'), 'error');
        }
    };

    const handleGalleryImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        console.log('[Debug] handleGalleryImageUpload triggered.');
        if (!user) {
            console.error('[Debug] User not found.');
            return;
        }
        const file = event.target.files?.[0];
        if (!file) {
            console.log('[Debug] No file selected.');
            return;
        }

        console.log(`[Debug] File selected:`, file.name, file.type);

        // Verificar límite de imágenes según el plan
        const currentImageCount = (profileData.galleryImageURLs || []).length;
        let maxImages = 0;
        if (profileData.plan === 'ultra') {
            maxImages = 20;
        } else if (profileData.plan === 'pro') {
            maxImages = 5;
        } else {
            alert('La galería multimedia es una característica de los planes PRO y ULTRA. Actualiza tu plan para acceder.');
            return;
        }
        
        if (currentImageCount >= maxImages) {
            alert(`Has alcanzado el límite de ${maxImages} imágenes del Plan ${profileData.plan.toUpperCase()}. ${profileData.plan === 'pro' ? 'Actualiza a ULTRA para hasta 20 imágenes.' : ''}`);
            return;
        }

        const fileName = `${Date.now()}_${file.name}`;
        try {
            console.log('[Debug] Uploading to Supabase Storage...');
            const { data, error } = await supabase.storage.from('assets').upload(`gallery_images/${user.id}/${fileName}`, file);
            if (error) throw error;
            
            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`gallery_images/${user.id}/${fileName}`);
            const downloadURL = publicUrl;

            console.log(`[Debug] File uploaded. Download URL: ${downloadURL}`);

            // Añadir la nueva URL al array
            const updatedGallery = [...(profileData.galleryImageURLs || []), downloadURL];
            setProfileData(prev => ({ ...prev, galleryImageURLs: updatedGallery }));
            
            console.log('[Debug] Updating DB with new gallery...');
            // Guardar automáticamente
            await supabase.from('profiles').update({ galleryImageURLs: updatedGallery }).eq('id', user.id);
            console.log('[Debug] DB updated.');
            showNotification('Imagen añadida a la galería', 'success');
        } catch (error) {
            console.error('[Debug] Error during gallery image upload:', error);
            showNotification('Error al subir imagen', 'error');
            alert(`Error al subir la imagen: ${error.message}`);
        }
    };

    const handleDeleteGalleryImage = async (index: number) => {
        if (!user) return;
        
        const updatedGallery = (profileData.galleryImageURLs || []).filter((_, i) => i !== index);
        setProfileData(prev => ({ ...prev, galleryImageURLs: updatedGallery }));
        
        try {
            await supabase.from('profiles').update({ galleryImageURLs: updatedGallery }).eq('id', user.id);
            showNotification('Imagen eliminada de la galería', 'success');
        } catch (error) {
            console.error('Error al eliminar imagen de galería:', error?.message || error || 'Ocurrió un error desconocido');
            showNotification('Error al eliminar imagen', 'error');
        }
    };

    // Funciones para gestión de testimonios
    const openTestimonialForm = (testimonial?: Testimonial) => {
        if (testimonial) {
            setEditingTestimonial(testimonial);
            setTestimonialForm({
                quote: testimonial.quote,
                author: testimonial.author,
                authorTitle: testimonial.authorTitle || '',
                authorImageURL: testimonial.authorImageURL || ''
            });
        } else {
            setEditingTestimonial(null);
            setTestimonialForm({
                quote: '',
                author: '',
                authorTitle: '',
                authorImageURL: ''
            });
        }
        setIsTestimonialFormOpen(true);
    };

    const closeTestimonialForm = () => {
        setIsTestimonialFormOpen(false);
        setEditingTestimonial(null);
        setTestimonialForm({
            quote: '',
            author: '',
            authorTitle: '',
            authorImageURL: ''
        });
    };

    const handleTestimonialImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        console.log('[Debug] handleTestimonialImageUpload triggered.');
        const file = event.target.files?.[0];
        if (!user) {
            console.error('[Debug] User not found.');
            return;
        }
        if (!file) {
            console.log('[Debug] No file selected.');
            return;
        }

        console.log(`[Debug] File selected:`, file.name, file.type);

        const fileName = `${Date.now()}_${file.name}`;
        try {
            console.log('[Debug] Uploading testimonial image to Supabase Storage...');
            const { data, error } = await supabase.storage.from('assets').upload(`testimonial_images/${user.id}/${fileName}`, file);
            if (error) throw error;
            
            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`testimonial_images/${user.id}/${fileName}`);
            const downloadURL = publicUrl;

            console.log(`[Debug] Testimonial image uploaded. Download URL: ${downloadURL}`);

            setTestimonialForm(prev => ({ ...prev, authorImageURL: downloadURL }));
            showNotification('Imagen subida correctamente', 'success');
        } catch (error) {
            console.error('[Debug] Error during testimonial image upload:', error);
            showNotification('Error al subir imagen', 'error');
            alert(`Error al subir la imagen: ${error.message}`);
        }
    };

    const handleAddTestimonial = async () => {
        if (!user || !testimonialForm.quote.trim() || !testimonialForm.author.trim()) {
            showNotification('La cita y el autor son obligatorios', 'error');
            return;
        }

        const newTestimonial: Testimonial = {
            id: Date.now().toString(),
            quote: testimonialForm.quote.trim(),
            author: testimonialForm.author.trim(),
            authorTitle: testimonialForm.authorTitle.trim() || undefined,
            authorImageURL: testimonialForm.authorImageURL.trim() || undefined
        };

        const updatedTestimonials = [...(profileData.testimonials || []), newTestimonial];
        setProfileData(prev => ({ ...prev, testimonials: updatedTestimonials }));

        try {
            await supabase.from('profiles').update({ testimonials: updatedTestimonials }).eq('id', user.id);
            showNotification('Testimonio añadido correctamente', 'success');
            closeTestimonialForm();
        } catch (error) {
            console.error('Error al guardar testimonio:', error?.message || error || 'Ocurrió un error desconocido');
            showNotification('Error al guardar testimonio', 'error');
        }
    };

    const handleUpdateTestimonial = async () => {
        if (!user || !editingTestimonial || !testimonialForm.quote.trim() || !testimonialForm.author.trim()) {
            showNotification('La cita y el autor son obligatorios', 'error');
            return;
        }

        const updatedTestimonial: Testimonial = {
            ...editingTestimonial,
            quote: testimonialForm.quote.trim(),
            author: testimonialForm.author.trim(),
            authorTitle: testimonialForm.authorTitle.trim() || undefined,
            authorImageURL: testimonialForm.authorImageURL.trim() || undefined
        };

        const updatedTestimonials = (profileData.testimonials || []).map(t =>
            t.id === editingTestimonial.id ? updatedTestimonial : t
        );
        setProfileData(prev => ({ ...prev, testimonials: updatedTestimonials }));

        try {
            await supabase.from('profiles').update({ testimonials: updatedTestimonials }).eq('id', user.id);
            showNotification('Testimonio actualizado correctamente', 'success');
            closeTestimonialForm();
        } catch (error) {
            console.error('Error al actualizar testimonio:', error?.message || error || 'Ocurrió un error desconocido');
            showNotification('Error al actualizar testimonio', 'error');
        }
    };

    const handleDeleteTestimonial = async (testimonialId: string) => {
        if (!user) return;

        const updatedTestimonials = (profileData.testimonials || []).filter(t => t.id !== testimonialId);
        setProfileData(prev => ({ ...prev, testimonials: updatedTestimonials }));

        try {
            await supabase.from('profiles').update({ testimonials: updatedTestimonials }).eq('id', user.id);
            showNotification('Testimonio eliminado correctamente', 'success');
        } catch (error) {
            console.error('Error al eliminar testimonio:', error?.message || error || 'Ocurrió un error desconocido');
            showNotification('Error al eliminar testimonio', 'error');
        }
    };

    // Funciones para gestionar testimonios pendientes
    const handleApproveTestimonial = async (testimonialToApprove: any) => {
        if (!user) return;

        // Crear el objeto Testimonial para el perfil (sin datos extra)
        const newApprovedTestimonial: Testimonial = { // Asegúrate de que 'Testimonial' esté definido/importado
            id: Date.now().toString(), // Generar un nuevo ID simple para el array
            quote: testimonialToApprove.quote,
            author: testimonialToApprove.author,
            authorTitle: testimonialToApprove.authorTitle || '',
            // authorImageURL: '', // No tenemos imagen desde el formulario público
        };

        try {
            // 1. Añadir al array 'testimonials' del profileData
            const updatedTestimonials = [...(profileData.testimonials || []), newApprovedTestimonial];
            const updatedProfile = { ...profileData, testimonials: updatedTestimonials };

            // 2. Guardar el profileData actualizado en BD
            await supabase.from('profiles').update({ testimonials: updatedTestimonials }).eq('id', user.id);

            // 3. (Opcional pero recomendado) Actualizar el estado local profileData
            setProfileData(updatedProfile);

            // 4. Eliminar de 'pendingTestimonials'
            await supabase.from('pending_testimonials').delete().eq('id', testimonialToApprove.id);

            // 5. Actualizar estado local de pendientes
            setPendingTestimonials(prev => prev.filter(t => t.id !== testimonialToApprove.id));

            console.log("Testimonio aprobado y añadido al perfil:", newApprovedTestimonial);
            alert(t('alert_testimonial_approved'));

        } catch (error) {
            console.error("Error aprobando testimonio:", error?.message || error || 'Ocurrió un error desconocido');
            alert(t('error_approving_testimonial'));
        }
    };

    const handleRejectTestimonial = async (pendingId: string) => {
        if (!window.confirm(t('confirm_reject_testimonial'))) return;
        try {
            await supabase.from('pending_testimonials').delete().eq('id', pendingId);
            // Actualizar estado local para quitarlo de la lista
            setPendingTestimonials(prev => prev.filter(t => t.id !== pendingId));
            console.log("Testimonio pendiente rechazado:", pendingId);
        } catch (error) {
            console.error("Error rechazando testimonio:", error?.message || error || 'Ocurrió un error desconocido');
            alert(t('error_rejecting_testimonial'));
        }
    };

    const handleDeleteLead = async (leadId: string) => {
        if (!window.confirm(t('confirm_delete_lead'))) return;
        try {
            await supabase.from('leads').delete().eq('id', leadId);
            // Actualizar estado local para quitarlo de la lista
            setLeads(prev => prev.filter(lead => lead.id !== leadId));
            showNotification(t('success_lead_deleted'), 'success');
        } catch (error) {
            console.error("Error eliminando lead:", error?.message || error || 'Ocurrió un error desconocido');
            showNotification(t('error_deleting_lead'), 'error');
        }
    };

    const handleUpdateLeadStamps = async (leadId: string, newStamps: number) => {
        const lead = leads.find(l => l.id === leadId);
        if (!lead) return;

        let displayName = lead.visitorName || 'Sin nombre';
        let clientCode = '';
        if (displayName.includes('|')) {
            const parts = displayName.split('|');
            displayName = parts[0] || 'Sin nombre';
            clientCode = parts[2] || '';
        }

        if (!clientCode) {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            let code = '';
            for (let i = 0; i < 4; i++) {
                code += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            clientCode = `B-${code}`;
        }

        try {
            const { data, error } = await supabase
                .from('leads')
                .update({ name: `${displayName}|${newStamps}|${clientCode}` })
                .eq('id', leadId)
                .select('*')
                .single();

            if (error) throw error;

            setLeads(prev => prev.map(l => l.id === leadId ? { ...l, visitorName: data.name } : l));
            showNotification("Sellos actualizados.", 'success');
        } catch (error: any) {
            console.error("Error al actualizar sellos:", error);
            showNotification("Error al actualizar sellos.", 'error');
        }
    };

    const handleSaveFidelityConfig = async (code: string) => {
        try {
            const sectionOrderConfig = Array.isArray(profileData.sectionOrder) ? profileData.sectionOrder : [];
            let updatedSectionOrder = [...sectionOrderConfig];
            const idx = updatedSectionOrder.findIndex((s: any) => s.type === 'barber_fidelity_config');

            if (idx >= 0) {
                updatedSectionOrder[idx] = { ...updatedSectionOrder[idx], validationCode: code };
            } else {
                updatedSectionOrder.push({ type: 'barber_fidelity_config', validationCode: code });
            }

            const { error } = await supabase
                .from('profiles')
                .update({ sectionOrder: updatedSectionOrder })
                .eq('id', user.id);

            if (error) throw error;

            setProfileData(prev => ({ ...prev, sectionOrder: updatedSectionOrder }));
            showNotification("Configuración de fidelidad guardada.", 'success');
        } catch (error: any) {
            console.error("Error al guardar código de fidelidad:", error);
            showNotification("Error al guardar configuración.", 'error');
        }
    };

    const handleExportContacts = () => {
        if (!leads || leads.length === 0) {
            alert(t('error_no_contacts_export'));
            return;
        }

        // 1. Definir cabeceras CSV
        const headers = ["Nombre", "Email", "Teléfono", "Notas", "Capturado En"];
        // 2. Convertir datos de leads a filas CSV (escapando comas y comillas)
        const csvRows = leads.map(lead => [
            `"${lead.visitorName?.replace(/"/g, '""') || ''}"`, // Nombre
            `"${lead.visitorEmail?.replace(/"/g, '""') || ''}"`, // Email
            `"${lead.visitorPhone?.replace(/"/g, '""') || ''}"`, // Teléfono
            `"${lead.visitorNotes?.replace(/"/g, '""') || ''}"`, // Notas
            `"${lead.capturedAt?.toDate().toLocaleString() || ''}"` // Fecha (convierte Timestamp a string legible)
        ].join(',')); // Unir con comas

        // 3. Crear el contenido CSV completo
        const csvContent = [
            headers.join(','), // Fila de cabeceras
            ...csvRows       // Filas de datos
        ].join('\n');      // Unir filas con salto de línea

        // 4. Crear un Blob y enlace de descarga
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        if (link.download !== undefined) { // Feature detection
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `connexo_contacts_${new Date().toISOString().split('T')[0]}.csv`); // Nombre de archivo
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            alert(t('error_csv_unsupported'));
        }
    };

    const handleViewProfile = () => {
        console.log('handleViewProfile called. profileData:', profileData);
        console.log('Username available?', profileData?.username);
        
        if (profileData?.username) { 
            console.log('Navigating to:', `/${profileData.username}`);
            navigate(`/${profileData.username}`);
        } else {
            alert(t('error_username_required_view'));
        }
    };

    const handleLogout = async () => {
        try {
            // Suelta este teléfono/navegador de la cuenta que sale, ANTES del
            // signOut (después ya no habría sesión para borrar la fila).
            // Sin esto el aparato seguía registrado para siempre y recibía los
            // pedidos y reservas de todas las cuentas que se hubieran abierto
            // en él: eran las "notificaciones fantasma".
            //
            // En modo MULTICUENTA no se suelta: ahí compartir el aparato es
            // deliberado, y soltarlo al salir haría imposible vigilar varios
            // negocios (sólo se puede tener una sesión abierta a la vez). En
            // ese modo el control está en la campana 🔔, que lista los
            // negocios del dispositivo y deja quitar cualquiera.
            if (user?.id && !(await pushMultiAccountEnabled())) {
                await releasePushDevice(user.id);
            }
            await supabase.auth.signOut();
        } catch (error) {
            console.error('Error al cerrar sesión:', error?.message || error || 'Ocurrió un error desconocido');
        }
    };

    const handleQRScanned = async (data: string) => {
        const rawData = (data || '').trim();
        showNotification(t('notification_qr_scanned', { data: rawData }), 'success');

        // Si el QR contiene una URL completa, la abrimos directamente
        if (/^https?:\/\//i.test(rawData)) {
            window.open(rawData, '_blank');
            return;
        }

        try {
            const cleaned = rawData.replace(/^https?:\/\//i, '').replace(window.location.host, '').replace(/^\//, '');
            const slug = cleaned.replace(/^p\//, '') || rawData;
            const url = `${window.location.origin}/p/${slug}`;
            window.open(url, '_blank');
        } catch (error) {
            console.error('Error processing QR data:', error);
            showNotification(t('notification_qr_error'), 'error');
        }
    };

    const tabs: { id: Tab; nameKey: any; icon: React.ReactNode }[] = [
        { id: 'links', nameKey: 'tab_links', icon: <Link className="w-5 h-5" /> },
        { id: 'appearance', nameKey: 'tab_appearance', icon: <Palette className="w-5 h-5" /> },
        { id: 'analytics', nameKey: 'tab_analytics', icon: <BarChart3 className="w-5 h-5" /> },
        { id: 'account', nameKey: 'tab_account', icon: <UserIcon className="w-5 h-5" /> },
    ];

    // El perfil E-commerce es una tienda autónoma: gestiona ventas vía Pedidos,
    // no usa CRM de contactos ni chat. Ocultamos esas pestañas para ese tema.
    const isEcom = profileData?.theme === 'ecom';
    // El restaurante reemplaza "Contactos" por "Clientes Fieles" (fidelidad/VIP).
    // Los perfiles de clínica (Petcare / Médico) reutilizan toda la maquinaria gastro (mismo back-office).
    const isGastro = profileData?.theme === 'gastro' || profileData?.theme === 'petcare' || profileData?.theme === 'medical';
    // Petcare y Médico: mismas funciones, pero etiquetas propias (Citas, Catálogo, Atenciones).
    const isPetcare = profileData?.theme === 'petcare';
    const isMedical = profileData?.theme === 'medical';
    // "Clínica" = petcare o médico → comparten etiquetas de agenda/catálogo/atenciones.
    const isClinic = isPetcare || isMedical;
    // La barbería también tiene su sistema de fidelidad (Club Barber).
    const isBarber = profileData?.theme === 'barber';
    // El perfil "Stage" (artistas/músicos) es un embudo de conversión propio.
    const isStage = profileData?.theme === 'stage';
    // El perfil "Realty" (inmobiliaria) es un motor de propiedades/agentes/CRM aislado.
    const isRealty = profileData?.theme === 'realty';
    // El perfil "Sublima" (fábrica-tienda textil) es un motor de catálogo por
    // volumen + pedidos mayoristas + club, 100% aislado (tablas sublima_*).
    const isSublima = profileData?.theme === 'sublima';
    const isProOrUltra = effectivePlan === 'pro' || effectivePlan === 'ultra';

    // Galería y Álbumes: pestaña propia (antes vivía dentro de Enlaces).
    // Sigue siendo PRO+, igual que cuando era una sección de esa pestaña.
    // Debe ir DESPUÉS de declarar isProOrUltra: leerlo antes lanza un
    // ReferenceError por zona muerta temporal y deja el panel en negro.
    if (isProOrUltra) {
        tabs.splice(1, 0, { id: 'gallery', nameKey: 'tab_gallery', icon: <Images className="w-5 h-5" /> });
    }

    if (isSublima) {
        // Globales (Enlaces, Apariencia, Analíticas, Cuenta) ya están añadidas.
        // Catálogo y Pedidos para todos los planes; Club Mayorista para PRO+.
        tabs.push({ id: 'sublima_products', nameKey: 'tab_sublima_products', icon: <Shirt className="w-5 h-5" /> });
        if (isProOrUltra) {
            tabs.push({ id: 'sublima_loyalty', nameKey: 'tab_sublima_loyalty', icon: <Users className="w-5 h-5" /> });
        }
        tabs.push({ id: 'sublima_orders', nameKey: 'tab_sublima_orders', icon: <ClipboardList className="w-5 h-5" /> });
    } else if (isRealty) {
        // Globales (Enlaces, Apariencia, Analíticas, Cuenta) ya están añadidas.
        // Propiedades y CRM para todos; Club (PRO+) y Agentes (sub-usuarios NFC, ULTRA).
        tabs.push({ id: 'realty_properties', nameKey: 'tab_realty_properties', icon: <Building2 className="w-5 h-5" /> });
        if (isProOrUltra) {
            tabs.push({ id: 'realty_loyalty', nameKey: 'tab_realty_loyalty', icon: <Users className="w-5 h-5" /> });
        }
        if (effectivePlan === 'ultra') {
            tabs.push({ id: 'realty_agents', nameKey: 'tab_realty_agents', icon: <UserCog className="w-5 h-5" /> });
        }
        tabs.push({ id: 'realty_leads', nameKey: 'tab_realty_leads', icon: <ClipboardList className="w-5 h-5" /> });
    } else if (isStage) {
        // Globales (Enlaces, Apariencia, Analíticas, Cuenta) ya están añadidas.
        // Módulos de artista, en orden: Lanzamientos, Tour, Merch, Fan Base (PRO+) y Prensa/EPK (ULTRA).
        if (isProOrUltra) {
            tabs.push({ id: 'stage_releases', nameKey: 'tab_stage_releases', icon: <Music className="w-5 h-5" /> });
            tabs.push({ id: 'stage_tour', nameKey: 'tab_stage_tour', icon: <Ticket className="w-5 h-5" /> });
            tabs.push({ id: 'ecom_products', nameKey: 'tab_stage_merch', icon: <ShoppingBag className="w-5 h-5" /> });
            tabs.push({ id: 'stage_fans', nameKey: 'tab_stage_fans', icon: <Heart className="w-5 h-5" /> });
        }
        if (effectivePlan === 'ultra') {
            tabs.push({ id: 'stage_press', nameKey: 'tab_stage_press', icon: <FolderOpen className="w-5 h-5" /> });
        }
    } else {
        if (isProOrUltra && (isGastro || isBarber)) {
            tabs.splice(3, 0, { id: 'loyalty', nameKey: 'tab_loyalty', icon: <Users className="w-5 h-5" /> });
        } else if (isProOrUltra && isEcom) {
            tabs.splice(3, 0, { id: 'ecom_loyalty', nameKey: 'tab_ecom_loyalty', icon: <Users className="w-5 h-5" /> });
        } else if (isProOrUltra && !isEcom) {
            tabs.splice(3, 0, { id: 'contacts', nameKey: 'tab_contacts', icon: <Users className="w-5 h-5" /> });
        }

        // El restaurante reemplaza "Mensajes" por "Menú y Mesas".
        // La barbería reemplaza "Mensajes" por "Servicios" (gestión de servicios + stock).
        // El chat se mantiene para los demás temas en ULTRA.
        if (isBarber) {
            // Servicios (profile.products) y Productos (profile.barber_products) son
            // catálogos distintos, cada uno con su propia pestaña.
            tabs.push({ id: 'services', nameKey: 'tab_services', icon: <Scissors className="w-5 h-5" /> });
            tabs.push({ id: 'barber_products', nameKey: 'tab_barber_products', icon: <Package className="w-5 h-5" /> });
            // Reservas (equipo + citas): exclusivo de barbería ULTRA.
            if (effectivePlan === 'ultra') {
                tabs.push({ id: 'barber_reservations', nameKey: 'tab_barber_reservations', icon: <CalendarCheck className="w-5 h-5" /> });
            }
        } else if (isGastro) {
            tabs.push({ id: 'menu', nameKey: isClinic ? 'tab_petcare_menu' : 'tab_menu', icon: isClinic ? <Package className="w-5 h-5" /> : <Utensils className="w-5 h-5" /> });
        } else if (effectivePlan === 'ultra' && !isEcom) {
            tabs.push({ id: 'chat', nameKey: 'tab_chat', icon: <MessageCircle className="w-5 h-5" /> });
        }

        if (effectivePlan === 'ultra' && isGastro) {
            tabs.push({ id: 'orders', nameKey: isClinic ? 'tab_petcare_orders' : 'tab_orders', icon: <ClipboardList className="w-5 h-5" /> });
            // Reservas e Inventario: exclusivos de gastronomía/clínica ULTRA.
            tabs.push({ id: 'reservations', nameKey: isClinic ? 'tab_petcare_reservations' : 'tab_reservations', icon: <CalendarCheck className="w-5 h-5" /> });
            tabs.push({ id: 'inventory', nameKey: 'tab_inventory', icon: <Boxes className="w-5 h-5" /> });
        }

        if (isEcom) {
            tabs.push({ id: 'ecom_products', nameKey: 'tab_ecom_products', icon: <Package className="w-5 h-5" /> });
            // Citas + vendedores: motor propio ecom_appointments (PRO y ULTRA,
            // igual que la tarjeta del club con la que convive en el perfil).
            if (isProOrUltra) {
                tabs.push({ id: 'ecom_appointments', nameKey: 'tab_ecom_appointments', icon: <CalendarCheck className="w-5 h-5" /> });
            }
        }

        if (effectivePlan === 'ultra' && profileData?.theme === 'ecom') {
            tabs.push({ id: 'ecom_orders', nameKey: 'tab_ecom_orders', icon: <ShoppingBag className="w-5 h-5" /> });
        }
    }

    // ─── Tour guiado (onboarding interactivo) ───────────────────────────────
    // Los pasos de pestaña se derivan del array `tabs` que se acaba de armar,
    // así que heredan tal cual el plan-gating y el filtrado por plantilla: si
    // una pestaña no le corresponde a este cliente, su paso tampoco existe.
    // La clave de memo es la lista de ids porque `tabs` se reconstruye en cada
    // render y como dependencia directa invalidaría el memo siempre.
    const tabIdsKey = tabs.map(tb => tb.id).join(',');
    const tourSteps = React.useMemo<TourStep[]>(() => [
        { titleKey: 'tour_welcome_title', bodyKey: 'tour_welcome_body' },
        ...tabs.map(tb => ({
            anchor: `tab-${tb.id}`,
            titleKey: tb.nameKey,
            bodyKey: `tour_tab_${tb.id}`,
        })),
        { anchor: 'notifications', titleKey: 'tour_notifications_title', bodyKey: 'tour_notifications_body' },
        { anchor: 'qr', titleKey: 'dashboard_header_scan_qr', bodyKey: 'tour_qr_body' },
        { anchor: 'view-profile', titleKey: 'dashboard_header_view_profile', bodyKey: 'tour_view_profile_body' },
        { anchor: 'language', titleKey: 'tour_language_title', bodyKey: 'tour_language_body' },
        { anchor: 'save', titleKey: 'save_changes', bodyKey: 'tour_save_body' },
        { anchor: 'logout', titleKey: 'dashboard_header_logout', bodyKey: 'tour_logout_body' },
        { anchor: 'help', titleKey: 'tour_help_title', bodyKey: 'tour_help_body' },
        { titleKey: 'tour_finish_title', bodyKey: 'tour_finish_body' },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ], [tabIdsKey]);

    // Debe quedar ANTES del retorno temprano de carga: un hook después de un
    // `return` condicional cambiaría el orden de hooks entre renders.
    const tour = useOnboarding(user?.id, !isProfileLoading);

    console.log('AdminDashboard - Rendering. ProfileData is null?', profileData === null);

    if (isProfileLoading) {
      return (
        <div className="min-h-screen bg-[var(--background-dark)] flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--primary-orange)]"></div>
            <p className="text-[var(--text-secondary)] text-sm">{t('loading_dashboard')}</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-[var(--background-dark)] flex overflow-x-clip">
        <QRScannerModal
          isOpen={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onQRScanned={handleQRScanned}
        />

        {/* Sidebar Navigation - Desktop */}
        <aside className="hidden lg:flex flex-col w-72 glass-panel border-r-0 fixed h-full z-30 transition-all duration-300">
          {/* Logo */}
          <div className="p-8 border-b border-[var(--dark-orange)]/10">
            <img src="/connexo-iso-word-o.png" alt="Connexo Logo" className="h-10 w-auto" />
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-5 space-y-2 overflow-y-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                data-tour={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-[var(--radius-md)] text-sm font-bold transition-all duration-300 ${
                  activeTab === tab.id 
                    ? 'bg-[var(--primary-orange)] text-white shadow-lg shadow-[var(--primary-orange)]/20' 
                    : 'text-[var(--text-secondary)] hover:text-white hover:bg-[var(--background-elevated)]'
                }`}
              >
                <span className="text-xl">{tab.icon}</span>
                <span className="font-tomorrow italic">{t(tab.nameKey)}</span>
                {tab.id === 'contacts' && leads.length > 0 && (
                  <span className="ml-auto bg-white text-[var(--background-dark)] text-[10px] font-black px-2 py-0.5 rounded-full">
                    {leads.length}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* User Section */}
          <div className="p-6 border-t border-[var(--dark-orange)]/10 space-y-3">
            {/* Subscription status badge */}
            {subscription && (
              <div style={{
                padding: '10px 14px', borderRadius: '12px',
                background: subIsExpired
                  ? 'rgba(239,68,68,0.08)'
                  : subIsTrialUrgent
                    ? 'rgba(239,68,68,0.06)'
                    : subscription.account_status === 'trial'
                      ? 'rgba(245,158,11,0.07)'
                      : 'rgba(34,197,94,0.07)',
                border: `1px solid ${
                  subIsExpired ? 'rgba(239,68,68,0.2)'
                  : subIsTrialUrgent ? 'rgba(239,68,68,0.15)'
                  : subscription.account_status === 'trial' ? 'rgba(245,158,11,0.18)'
                  : 'rgba(34,197,94,0.15)'
                }`,
              }}>
                <div style={{
                  fontSize: '9px', fontWeight: 800, letterSpacing: '1.5px',
                  textTransform: 'uppercase',
                  color: subIsExpired ? '#ef4444'
                    : subIsTrialUrgent ? '#ef4444'
                    : subscription.account_status === 'trial' ? '#f59e0b'
                    : '#22c55e',
                  marginBottom: '4px',
                }}>
                  {subIsExpired ? 'TRIAL EXPIRADO'
                    : subscription.account_status === 'trial' ? 'EN PERÍODO DE PRUEBA'
                    : subscription.plan_type === 'mensual_pago' ? 'SUSCRIPCIÓN MENSUAL'
                    : subscription.plan_type === 'anual_pago' ? 'SUSCRIPCIÓN ANUAL'
                    : 'ACTIVO'}
                </div>
                {!subIsExpired && subscription.account_status === 'trial' && subDaysLeft !== null && (
                  <div style={{ fontSize: '12px', color: subIsTrialUrgent ? '#fca5a5' : 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
                    {subDaysLeft > 0 ? `${subDaysLeft} día${subDaysLeft !== 1 ? 's' : ''} restantes` : 'Vence hoy'}
                  </div>
                )}
                {subIsExpired && (
                  <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                    Contacta a Connexo para reactivar tu perfil.
                  </div>
                )}
                {subscription.account_status === 'active' && (
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: '#22c55e', letterSpacing: '0.5px' }}>
                      {subscription.plan_type === 'anual_pago' ? 'ANUAL' : 'MENSUAL'}
                    </div>
                    {subNextBilling && (
                      <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)' }}>
                        · cobro {subNextBilling.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-4 px-4 py-3 rounded-[var(--radius-md)] bg-[var(--background-dark)] border border-[var(--dark-orange)]/10">
              <div className="w-10 h-10 rounded-full bg-[var(--primary-orange)]/10 flex items-center justify-center border border-[var(--primary-orange)]/20">
                <span className="text-[var(--primary-orange)] text-sm font-black">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">
                  {profileData.displayName || user?.email?.split('@')[0] || 'Usuario'}
                </p>
                <p className="text-[10px] text-[var(--text-muted)] truncate uppercase tracking-widest">{effectivePlan}</p>
              </div>
            </div>
            <LanguageSwitcher />
          </div>
        </aside>

        {/* Main Content — pt-* compensa el header fijo (h-12 móvil / h-16 ≥md y desktop) */}
        <main className="flex-1 min-w-0 lg:ml-72 min-h-screen pt-12 md:pt-16 overflow-x-clip">
          {/* Top Header */}
          <header className="fixed top-0 left-0 right-0 lg:left-72 z-50 glass-panel border-b-0 shadow-2xl">
            <div className="flex items-center justify-between px-3 md:px-6 h-12 md:h-16">
              {/* Mobile Logo — cede espacio a los controles.
                  El archivo mide 2153x301, así que a h-6 ocupa ~172px de ancho:
                  con `shrink-0` empujaba los botones de la derecha fuera de la
                  pantalla y el de cerrar sesión, por ser el último, quedaba
                  recortado. Ahora el ancho lo decide el espacio sobrante
                  (flex-1 + min-w-0) y la imagen se escala dentro con
                  object-contain, así que los controles nunca se pierden. */}
              <div className="lg:hidden flex-1 min-w-0 flex items-center overflow-hidden pr-2">
                <img
                  src="/connexo-iso-word-o.png"
                  alt="Connexo"
                  className="h-6 w-auto max-w-full object-contain object-left block"
                />
              </div>

              {/* Page Title - Desktop Only */}
              <div className="hidden lg:block">
                <h1 className="text-2xl font-black text-white font-tomorrow italic uppercase tracking-wider">
                  {activeTab === 'links' && t('tab_links')}
                  {activeTab === 'gallery' && (t('tab_gallery') || 'Galería')}
                  {activeTab === 'appearance' && t('tab_appearance')}
                  {activeTab === 'analytics' && t('tab_analytics')}
                  {activeTab === 'account' && t('tab_account')}
                  {activeTab === 'contacts' && t('tab_contacts')}
                  {activeTab === 'loyalty' && (t('tab_loyalty') || 'Clientes Fieles')}
                  {activeTab === 'ecom_loyalty' && 'Clientes'}
                  {activeTab === 'ecom_products' && (t('tab_ecom_products') || 'Productos')}
                  {activeTab === 'ecom_appointments' && (t('tab_ecom_appointments') || 'Citas')}
                  {activeTab === 'services' && (t('tab_services') || 'Servicios')}
                  {activeTab === 'barber_products' && (t('tab_barber_products') || 'Productos')}
                  {activeTab === 'barber_reservations' && (t('tab_barber_reservations') || 'Reservas')}
                  {activeTab === 'menu' && (isClinic ? 'Catálogo de Productos' : (t('tab_menu') || 'Menú y Mesas'))}
                  {activeTab === 'reservations' && (isClinic ? 'Citas' : (t('tab_reservations') || 'Reservas'))}
                  {activeTab === 'inventory' && (t('tab_inventory') || 'Inventario')}
                  {activeTab === 'chat' && t('tab_chat')}
                  {activeTab === 'orders' && (isClinic ? 'Atenciones' : (t('tab_orders') || 'Comandas'))}
                  {activeTab === 'ecom_orders' && (t('tab_ecom_orders') || 'Pedidos')}
                  {activeTab === 'stage_releases' && (t('tab_stage_releases') || 'Lanzamientos')}
                  {activeTab === 'stage_tour' && (t('tab_stage_tour') || 'Tour & Tickets')}
                  {activeTab === 'stage_fans' && (t('tab_stage_fans') || 'Fan Base')}
                  {activeTab === 'stage_press' && (t('tab_stage_press') || 'Prensa & EPK')}
                  {activeTab === 'realty_properties' && (t('tab_realty_properties') || 'Propiedades')}
                  {activeTab === 'realty_loyalty' && (t('tab_realty_loyalty') || 'Club de Inversionistas')}
                  {activeTab === 'realty_agents' && (t('tab_realty_agents') || 'Agentes')}
                  {activeTab === 'realty_leads' && (t('tab_realty_leads') || 'CRM de Inversionistas')}
                  {activeTab === 'sublima_products' && (t('tab_sublima_products') || 'Catálogo')}
                  {activeTab === 'sublima_loyalty' && (t('tab_sublima_loyalty') || 'Club Mayorista')}
                  {activeTab === 'sublima_orders' && (t('tab_sublima_orders') || 'Pedidos Mayoristas')}
                </h1>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1.5 md:gap-2 ml-auto shrink-0">
                {user?.id && (
                  <span data-tour="notifications" className="flex items-center">
                    <NotificationCenter userId={user.id} onNavigate={(tab) => setActiveTab(tab as Tab)} />
                  </span>
                )}
                {/* Relanzar el tour guiado cuando el cliente quiera repasarlo.
                    Visible también en móvil: es la única forma de volver a
                    abrir la guía, así que esconderla en pantallas chicas la
                    dejaba fuera del alcance de la mayoría de los clientes. */}
                <button
                  data-tour="help"
                  onClick={tour.start}
                  title={t('tour_restart')}
                  className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg text-[var(--primary-orange)] border border-[var(--dark-orange)]/30 bg-[var(--background-elevated)]/40 hover:bg-[var(--dark-orange)]/20 active:scale-95 transition-all"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
                {/* Icon buttons hidden on extremely small mobile to prevent overcrowding */}
                <button
                  data-tour="qr"
                  onClick={() => setIsScannerOpen(true)}
                  title={t('dashboard_header_scan_qr')}
                  className="hidden sm:flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg text-[var(--primary-orange)] border border-[var(--dark-orange)]/30 bg-[var(--background-elevated)]/40 hover:bg-[var(--dark-orange)]/20 active:scale-95 transition-all"
                >
                  <QrCode className="w-4 h-4" />
                </button>
                <button
                  data-tour="view-profile"
                  onClick={handleViewProfile}
                  title={t('dashboard_header_view_profile')}
                  className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg text-white border border-white/10 bg-white/5 hover:bg-white/10 active:scale-95 transition-all"
                >
                  <Eye className="w-4 h-4" />
                </button>

                <div data-tour="language" className="flex items-center scale-75 md:scale-90 origin-right">
                    <LanguageSwitcher />
                </div>

                <button
                  data-tour="save"
                  onClick={handleSaveProfile}
                  title={t('save_changes')}
                  className="flex items-center justify-center gap-1.5 h-8 md:h-9 px-2.5 md:px-3.5 rounded-lg bg-[var(--primary-orange)] text-white font-black text-xs uppercase tracking-wider hover:opacity-90 active:scale-95 transition-all shadow-lg shadow-orange-500/20"
                >
                  <Save className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">{t('save_changes')}</span>
                </button>
                <button
                  data-tour="logout"
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className="flex items-center justify-center w-8 h-8 md:w-9 md:h-9 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-500/10 active:scale-95 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </header>

          {/* Content Area — overscroll/overflow-anchor evitan el rebote de scroll en móvil */}
          <div className="w-full min-w-0 max-w-full overflow-x-clip overscroll-y-contain [overflow-anchor:none]">

            {/* ─── Subscription notice banner (trial / expired) ─── */}
            {subscription && (subIsExpired || subscription.account_status === 'trial') && (
              <div style={{
                padding: '10px 20px',
                background: subIsExpired
                  ? 'rgba(239,68,68,0.07)'
                  : subIsTrialUrgent
                    ? 'rgba(239,68,68,0.06)'
                    : 'rgba(245,158,11,0.06)',
                borderBottom: `1px solid ${subIsExpired || subIsTrialUrgent ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '15px' }}>{subIsExpired ? '🔒' : '⏳'}</span>
                  <div>
                    <span style={{
                      fontSize: '11px', fontWeight: 800, letterSpacing: '0.8px', textTransform: 'uppercase',
                      color: subIsExpired || subIsTrialUrgent ? '#ef4444' : '#f59e0b',
                    }}>
                      {subIsExpired ? 'Trial vencido — perfil suspendido' : 'Período de prueba activo'}
                    </span>
                    {!subIsExpired && subDaysLeft !== null && (
                      <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)', marginLeft: '8px' }}>
                        {subDaysLeft > 0 ? `${subDaysLeft} día${subDaysLeft !== 1 ? 's' : ''} restantes` : 'Vence hoy'}
                      </span>
                    )}
                  </div>
                </div>
                <a
                  href={`https://wa.me/${CONNEXO_SUPPORT_WA}?text=${encodeURIComponent(
                    subIsExpired
                      ? '¡Hola Connexo! Mi período de prueba venció y necesito reactivar mi perfil.'
                      : '¡Hola Connexo! Quiero conocer los planes de suscripción para continuar usando mi perfil.'
                  )}`}
                  target="_blank" rel="noopener noreferrer"
                  style={{
                    padding: '5px 14px', borderRadius: '20px', fontSize: '11px', fontWeight: 800,
                    letterSpacing: '0.5px', textDecoration: 'none', whiteSpace: 'nowrap',
                    background: subIsExpired || subIsTrialUrgent ? 'rgba(239,68,68,0.12)' : 'rgba(245,158,11,0.12)',
                    color: subIsExpired || subIsTrialUrgent ? '#ef4444' : '#f59e0b',
                    border: `1px solid ${subIsExpired || subIsTrialUrgent ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                  }}
                >
                  {subIsExpired ? 'Contactar soporte →' : 'Ver planes →'}
                </a>
              </div>
            )}

            <React.Suspense fallback={<TabSpinner />}>
            {activeTab === 'links' && (
                <LinksTab
                    links={links} 
                    setLinks={setLinks} 
                    profileData={profileData} 
                    setProfileData={setProfileData} 
                    user={user}
                    handleGalleryImageUpload={handleGalleryImageUpload}
                    handleDeleteGalleryImage={handleDeleteGalleryImage}
                    pendingTestimonials={pendingTestimonials}
                    handleApproveTestimonial={handleApproveTestimonial}
                    handleRejectTestimonial={handleRejectTestimonial}
                    openTestimonialForm={openTestimonialForm}
                    closeTestimonialForm={closeTestimonialForm}
                    handleAddTestimonial={handleAddTestimonial}
                    handleUpdateTestimonial={handleUpdateTestimonial}
                    handleDeleteTestimonial={handleDeleteTestimonial}
                    handleTestimonialImageUpload={handleTestimonialImageUpload}
                    isTestimonialFormOpen={isTestimonialFormOpen}
                    editingTestimonial={editingTestimonial}
                    testimonialForm={testimonialForm}
                    setTestimonialForm={setTestimonialForm}
                />
            )}
            {activeTab === 'gallery' && profileData && (
                <GalleryTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    handleGalleryImageUpload={handleGalleryImageUpload}
                    handleDeleteGalleryImage={handleDeleteGalleryImage}
                />
            )}
            {activeTab === 'appearance' && profileData && (
                <AppearanceTab 
                    profileData={profileData} 
                    setProfileData={setProfileData} 
                    user={user}
                    handleInputChange={handleInputChange}
                    generateCopy={generateCopy}
                    isGenerating={isGenerating}
                    suggestions={suggestions}
                    suggestionTargetField={suggestionTargetField}
                    setSuggestions={setSuggestions}
                    setSuggestionTargetField={setSuggestionTargetField}
                    links={links}
                />
            )}
            {activeTab === 'analytics' && (
                <AnalyticsTab 
                    profileData={profileData}
                    user={user}
                    analyticsData={analyticsData}
                    userPlan={effectivePlan}
                />
            )}
            {activeTab === 'account' && (
                <AccountTab 
                    user={user} 
                    profileData={profileData} 
                    setProfileData={setProfileData} 
                    showNotification={showNotification} 
                />
            )}
            {activeTab === 'contacts' && (
                <ContactsTab 
                    leads={leads}
                    onExport={handleExportContacts}
                    onDelete={handleDeleteLead}
                    onUpdateStamps={handleUpdateLeadStamps}
                    validationCode={(() => {
                        const sectionOrderConfig = Array.isArray(profileData.sectionOrder) ? profileData.sectionOrder : [];
                        const config = sectionOrderConfig.find((s: any) => s.type === 'barber_fidelity_config');
                        return config?.validationCode || '1234';
                    })()}
                    onSaveValidationCode={handleSaveFidelityConfig}
                    theme={profileData?.theme}
                />
            )}
            {activeTab === 'chat' && (
                <div className="flex h-[calc(100vh-140px)] bg-[var(--background-card)] rounded-[var(--radius-lg)] border border-[var(--card-border)] overflow-hidden">
                    <ChatList onSelectChat={setSelectedChatId} user={user} />
                    <ChatWindow
                        chatId={selectedChatId}
                        user={user}
                        onClose={() => setSelectedChatId(null)}
                    />
                </div>
            )}
            {activeTab === 'loyalty' && (
                profileData?.theme === 'barber'
                    ? <BarberLoyaltyTab user={user} />
                    : <LoyaltyTab user={user} isPetcare={isPetcare} isMedical={isMedical} />
            )}
            {activeTab === 'services' && (
                <BarberServicesTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                />
            )}
            {activeTab === 'barber_products' && (
                <BarberProductsTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                />
            )}
            {activeTab === 'barber_reservations' && (
                <BarberReservationsTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                />
            )}
            {activeTab === 'menu' && (
                <GastroMenuTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                    isPetcare={isPetcare}
                    isMedical={isMedical}
                />
            )}
            {activeTab === 'orders' && (
                <OrdersTab user={user} isPetcare={isPetcare} isMedical={isMedical} />
            )}
            {activeTab === 'reservations' && (
                <GastroReservationsTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                    isPetcare={isPetcare}
                    isMedical={isMedical}
                />
            )}
            {activeTab === 'inventory' && (
                <GastroInventoryTab
                    user={user}
                    showNotification={showNotification}
                />
            )}
            {activeTab === 'ecom_orders' && (
                <EcomOrdersTab user={user} />
            )}
            {activeTab === 'ecom_loyalty' && (
                <EcomLoyaltyTab user={user} />
            )}
            {activeTab === 'ecom_products' && (
                <EcomProductsTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                />
            )}
            {activeTab === 'ecom_appointments' && (
                <EcomAppointmentsTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                />
            )}
            {activeTab === 'stage_releases' && (
                <StageReleasesTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                />
            )}
            {activeTab === 'stage_tour' && (
                <StageTourTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                />
            )}
            {activeTab === 'stage_fans' && (
                <StageFansTab user={user} />
            )}
            {activeTab === 'stage_press' && (
                <StagePressTab
                    user={user}
                    profileData={profileData}
                    setProfileData={setProfileData}
                    showNotification={showNotification}
                />
            )}
            {activeTab === 'realty_properties' && (
                <RealtyPropertiesTab user={user} showNotification={showNotification} />
            )}
            {activeTab === 'realty_agents' && (
                <RealtyAgentsTab user={user} profileData={profileData} showNotification={showNotification} />
            )}
            {activeTab === 'realty_loyalty' && (
                <RealtyLoyaltyTab user={user} />
            )}
            {activeTab === 'sublima_products' && (
                <SublimaProductsTab user={user} showNotification={showNotification} />
            )}
            {activeTab === 'sublima_loyalty' && (
                <SublimaLoyaltyTab user={user} />
            )}
            {activeTab === 'sublima_orders' && (
                <SublimaOrdersTab user={user} />
            )}
            {activeTab === 'realty_leads' && (
                <RealtyLeadsTab user={user} />
            )}
            </React.Suspense>
          </div>

          {/* Footer */}
          <footer className="px-6 py-4 border-t border-[var(--card-border)] hidden lg:block">
            <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-muted)]">
              <img src="/connexo-iso-o.png" alt="Connexo Isotype" className="h-4 w-4" />
              <span>{t('footer_developed_by')}</span>
            </div>
          </footer>
        </main>

        {/* Mobile Navigation */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 z-50 glass-panel border-t-0 shadow-[0_-8px_24px_rgba(0,0,0,0.8)]"
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
        >
          <div className="flex items-center justify-between w-full">
            {tabs.map(tab => (
              <button
                key={tab.id}
                data-tour={`tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex flex-col items-center justify-center py-2 h-[60px] relative transition-all duration-300 active:scale-95 ${
                  activeTab === tab.id
                    ? 'text-[var(--primary-orange)]'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {/* Active top indicator */}
                {activeTab === tab.id && (
                  <span className="absolute top-0 left-[20%] right-[20%] h-[3px] bg-[var(--primary-orange)] rounded-b-full shadow-[0_0_8px_var(--primary-orange)]" />
                )}
                
                {/* Icon wrapper with animated floating transform */}
                <div className={`text-xl transition-all duration-300 transform ${
                  activeTab === tab.id ? '-translate-y-2.5 drop-shadow-md' : 'translate-y-0.5'
                }`}>
                  {tab.icon}
                </div>
                
                {/* Animated label popping up beneath active tab */}
                <span className={`text-[10px] font-bold font-sans tracking-wide absolute bottom-1.5 transition-all duration-300 ${
                  activeTab === tab.id 
                    ? 'opacity-100 translate-y-0' 
                    : 'opacity-0 translate-y-3 pointer-events-none'
                }`}>
                  {t(tab.nameKey)}
                </span>
              </button>
            ))}
          </div>
        </nav>

        {/* Notification */}
        {notification && (
          <Notification
            message={notification.message}
            type={notification.type}
            onClose={() => setNotification(null)}
          />
        )}

        {/* Tour guiado del panel (automático la primera vez, luego a demanda) */}
        <OnboardingTour
          isActive={tour.isActive}
          steps={tourSteps}
          onClose={tour.stop}
        />

        {/* Modal del Formulario de Testimonios */}
        {isTestimonialFormOpen && (
          <TestimonialFormModal
            isOpen={isTestimonialFormOpen}
            onClose={closeTestimonialForm}
            editingTestimonial={editingTestimonial}
            testimonialForm={testimonialForm}
            setTestimonialForm={setTestimonialForm}
            onSubmit={editingTestimonial ? handleUpdateTestimonial : handleAddTestimonial}
            onImageUpload={handleTestimonialImageUpload}
          />
        )}
      </div>
    );
  };

export default AdminDashboard;
