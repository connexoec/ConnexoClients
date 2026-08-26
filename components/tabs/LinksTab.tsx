import React, { useState, useEffect } from 'react';
import { Button, Input, Textarea, Card, Badge, ToggleSwitch } from '../ui';
import type { UserLink, Product, Testimonial } from '../../types';
import { supabase } from '../../src/lib/supabase';


import { useLanguage } from '../../contexts/LanguageContext';
import { 
  ExternalLink, 
  Link, 
  Phone, 
  Globe, 
  ShoppingBag, 
  Images, 
  MessageCircle, 
  FileText, 
  HelpCircle,
  Video,
  GripVertical,
  Trash2,
  Plus
} from 'lucide-react';

// Brand Colors - Use variables from index.html for consistency, but keep these as fallback
const BRAND = {
  orange: '#ff6600',
  darkOrange: '#962700',
  background: '#210900',
  offWhite: '#ffefe5',
  peach: '#ffa35d',
  black: '#000000',
  white: '#ffffff',
};

interface LinksTabProps {
    links: UserLink[];
    setLinks: React.Dispatch<React.SetStateAction<UserLink[]>>;
    profileData: any;
    setProfileData: React.Dispatch<React.SetStateAction<any>>;
    user: any;
    handleGalleryImageUpload?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleDeleteGalleryImage?: (index: number) => void;
    pendingTestimonials: any[];
    handleApproveTestimonial: (testimonial: any) => void;
    handleRejectTestimonial: (testimonialId: string) => void;
    openTestimonialForm: (testimonial?: Testimonial) => void;
    closeTestimonialForm: () => void;
    handleAddTestimonial: () => void;
    handleUpdateTestimonial: () => void;
    handleDeleteTestimonial: (testimonialId: string) => void;
    handleTestimonialImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
    isTestimonialFormOpen: boolean;
    editingTestimonial: Testimonial | null;
    testimonialForm: {
        quote: string;
        author: string;
        authorTitle: string;
        authorImageURL: string;
    };
    setTestimonialForm: React.Dispatch<React.SetStateAction<{
        quote: string;
        author: string;
        authorTitle: string;
        authorImageURL: string;
    }>>;
}

// XSS Protection: Sanitize URLs before saving to Firestore
const sanitizeUrl = (url: string): string => {
    if (!url) return "";
    let cleanUrl = url.trim();
    
    // Si empieza con protocolos vÃ¡lidos, la dejamos pasar
    if (/^(https?:\/\/|mailto:|tel:|wa\.me\/)/i.test(cleanUrl)) {
        return cleanUrl;
    }
    
    // Bloquear explÃ­citamente scripts maliciosos (XSS)
    if (/^(javascript:|data:|vbscript:)/i.test(cleanUrl)) {
        console.warn("URL maliciosa bloqueada");
        return ""; 
    }
    
    // Si el usuario solo escribiÃ³ 'www.google.com' o 'miweb.com', le ponemos https://
    return `https://${cleanUrl}`;
};

export const LinksTab: React.FC<LinksTabProps> = ({
    links,
    setLinks,
    profileData,
    setProfileData,
    user,
    handleGalleryImageUpload,
    handleDeleteGalleryImage,
    pendingTestimonials,
    handleApproveTestimonial,
    handleRejectTestimonial,
    openTestimonialForm,
    closeTestimonialForm,
    handleAddTestimonial,
    handleUpdateTestimonial,
    handleDeleteTestimonial,
    handleTestimonialImageUpload,
    isTestimonialFormOpen,
    editingTestimonial,
    testimonialForm,
    setTestimonialForm
}) => {
    const { t } = useLanguage();
    console.log('LinksTab MOUNTED. Initial links prop:', links, 'User:', user); // <-- LOG 1
    const [newLink, setNewLink] = useState({ title: '', url: '' });
    const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
    const [editLinkDraft, setEditLinkDraft] = useState({ title: '', url: '' });
    const [savingLinkId, setSavingLinkId] = useState<string | null>(null);
    const [isAddingProduct, setIsAddingProduct] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [newProduct, setNewProduct] = useState<Partial<Product>>({});
    const [draggedLinkIndex, setDraggedLinkIndex] = useState<number | null>(null);
    const [videoInputMode, setVideoInputMode] = useState<'external' | 'upload'>('external');
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadingThumbnail, setUploadingThumbnail] = useState<[boolean, boolean]>([false, false]);
    const [isSavingSocial, setIsSavingSocial] = useState(false);
    const [socialSaveStatus, setSocialSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');
    const [isUploadingFile, setIsUploadingFile] = useState(false);

    const isUltra = profileData?.plan === 'ultra';

    const handleSaveSocialMedia = async () => {
        if (!user) return;
        setIsSavingSocial(true);
        setSocialSaveStatus('idle');
        try {
            const { error } = await supabase
                .from('profiles')
                .update({ socialMedia: profileData.socialMedia || {} })
                .eq('id', user.id);
            if (error) throw error;
            setSocialSaveStatus('success');
            setTimeout(() => setSocialSaveStatus('idle'), 2500);
        } catch (e: any) {
            console.error('Error saving social media:', e?.message || e);
            setSocialSaveStatus('error');
            setTimeout(() => setSocialSaveStatus('idle'), 3000);
        } finally {
            setIsSavingSocial(false);
        }
    };
    const updateFeaturedVideo = (index: number, update: Partial<{ url: string; thumbnailURL: string }>) => {
        const current: Array<{ url: string; thumbnailURL?: string }> =
            Array.isArray(profileData?.featuredVideos) ? [...profileData.featuredVideos] : [];
        while (current.length <= index) current.push({ url: '', thumbnailURL: '' });
        current[index] = { ...current[index], ...update };
        setProfileData((prev: any) => ({ ...prev, featuredVideos: current }));
    };

    const handleVideoThumbnailUpload = async (index: number, file: File) => {
        if (!user) return;
        try {
            setUploadingThumbnail(prev => { const n: [boolean, boolean] = [prev[0], prev[1]]; n[index] = true; return n; });
            const ext = file.name.split('.').pop() || 'jpg';
            const filePath = `video_thumbnails/${user.id}/${index}_${Date.now()}.${ext}`;
            const { error } = await supabase.storage.from('assets').upload(filePath, file, { upsert: true });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(filePath);
            updateFeaturedVideo(index, { thumbnailURL: publicUrl });
        } catch (e: any) {
            alert('Error al subir imagen: ' + (e?.message || 'Error desconocido'));
        } finally {
            setUploadingThumbnail(prev => { const n: [boolean, boolean] = [prev[0], prev[1]]; n[index] = false; return n; });
        }
    };


    useEffect(() => {
        if (!user || !user.id) return;

        console.log("LinksTab: Fetching links for", user.id);
        
        const fetchLinks = async () => {
            try {
                const { data, error } = await supabase
                    .from('links')
                    .select('*')
                    .eq('userId', user.id);
                    
                if (error) throw error;
                
                if (data) {
                    const fetchedLinks = data.map(link => ({
                        ...link,
                        order: typeof link.order === 'number' ? link.order : 9999
                    })) as UserLink[];
                    fetchedLinks.sort((a, b) => a.order - b.order);
                    setLinks(fetchedLinks);
                    console.log("LinksTab: Links fetched:", fetchedLinks.length);
                }
            } catch (err) {
                console.error("Error fetching links:", err);
            }
        };

        fetchLinks();

        // Realtime subscription
        const channel = supabase.channel('public:links')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'links', filter: `userId=eq.${user.id}` }, payload => {
                console.log('Change received in links table!', payload);
                fetchLinks();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [user, setLinks]);

    useEffect(() => {
        if (isUltra && profileData?.uploadedVideoURL) {
            setVideoInputMode('upload');
        }
    }, [isUltra, profileData?.uploadedVideoURL]);

    const handleVideoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user || !isUltra) return;

        const file = event.target.files?.[0];
        if (!file) return;

        const maxSizeMB = 100;
        if (file.size > maxSizeMB * 1024 * 1024) {
            alert(t('video_too_large', { maxSize: String(maxSizeMB) }));
            event.target.value = '';
            return;
        }

        try {
            setUploadingVideo(true);
            setUploadProgress(0);

            const filePath = `video_uploads/${user.id}/${Date.now()}_${file.name}`;
            const { data, error } = await supabase.storage.from('assets').upload(filePath, file);
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(filePath);
            const downloadURL = publicUrl;

            setProfileData((prev: any) => ({
                ...prev,
                uploadedVideoURL: downloadURL,
                featuredVideoURL: ''
            }));

            await supabase.from('profiles').update({ uploadedVideoURL: downloadURL, featuredVideoURL: '' }).eq('id', user.id);

            alert(t('video_upload_success'));
        } catch (error) {
            console.error('Error al subir el video:', error?.message || error || 'OcurriÃ³ un error desconocido');
            alert(t('video_upload_error'));
        } finally {
            setUploadingVideo(false);
            setUploadProgress(0);
            event.target.value = '';
        }
    };

    const handleDeleteUploadedVideo = async () => {
        if (!user) return;
        if (!profileData?.uploadedVideoURL) return;

        const confirmed = window.confirm('Â¿Seguro que deseas eliminar el video subido?');
        if (!confirmed) return;

        try {
            const path = profileData.uploadedVideoURL.split('/storage/v1/object/public/assets/')[1];
            if (path) {
                await supabase.storage.from('assets').remove([path]);
            }

            await supabase.from('profiles').update({ uploadedVideoURL: null }).eq('id', user.id);

            setProfileData((prev: any) => ({ ...prev, uploadedVideoURL: null }));
            setVideoInputMode('external');

            alert(t('video_delete_success'));
        } catch (error) {
            console.error('Error al eliminar el video subido:', error?.message || error || 'OcurriÃ³ un error desconocido');
            alert(t('video_delete_error'));
        }
    };

    // Funciones para manejar enlaces
    const handleAddLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newLink.title || !newLink.url) {
            console.log('handleAddLink: Missing user or newLink data.');
            return;
        }
        
        // Verificar lÃ­mite de enlaces segÃºn el plan
        const maxLinks = profileData.plan === 'conecta' || !profileData.plan ? 10 : Infinity;
        if (links.length >= maxLinks) {
            alert(t('links_limit_reached', { max: String(maxLinks) }));
            return;
        }
        
        console.log('handleAddLink: Attempting to add:', newLink, 'for user:', user.id); // <-- LOG 5

        // Sanitize URL for XSS protection
        const safeUrl = sanitizeUrl(newLink.url);

        const linkDataToAdd = {
            userId: user.id, // <-- Doble verificar
            title: newLink.title,
            url: safeUrl,
            isActive: true,
            order: links.length // <-- Asegurar que 'links' es el estado actual
        };

        try {
            const { data: docData, error: insertError } = await supabase.from('links').insert([linkDataToAdd]).select().single();
            if (insertError) throw insertError;
            const docRef = { id: docData.id };
            console.log('handleAddLink: Firestore success. New doc ID:', docRef.id); // <-- LOG 6

            // Actualizar estado local DESPUÃS de Firestore
            const newlyAddedLink = { id: docRef.id, ...linkDataToAdd };
            setLinks(prevLinks => [...prevLinks, newlyAddedLink]); // <-- Llamada CRUCIAL
            console.log('handleAddLink: Local state updated:', newlyAddedLink); // <-- LOG 7

            setNewLink({ title: '', url: '' }); // Limpiar formulario
        } catch (error) {
            console.error("handleAddLink: Error adding link to Firestore:", error?.message || error || 'OcurriÃ³ un error desconocido'); // <-- LOG 8
        }
    };

    // Edición en línea de un enlace ya creado.
    const startEditLink = (link: UserLink) => {
        setEditingLinkId(link.id);
        setEditLinkDraft({ title: link.title || '', url: link.url || '' });
    };

    const cancelEditLink = () => {
        setEditingLinkId(null);
        setEditLinkDraft({ title: '', url: '' });
    };

    const handleSaveLinkEdit = async (linkId: string) => {
        if (!user) return;
        const title = editLinkDraft.title.trim();
        const url = editLinkDraft.url.trim();
        if (!title || !url) {
            alert(t('links_edit_required') || 'El enlace necesita un título y una URL.');
            return;
        }

        const safeUrl = sanitizeUrl(url);
        setSavingLinkId(linkId);
        try {
            const { error } = await supabase.from('links').update({ title, url: safeUrl }).eq('id', linkId);
            if (error) throw error;
            setLinks(prev => prev.map(link =>
                link.id === linkId ? { ...link, title, url: safeUrl } : link
            ));
            cancelEditLink();
        } catch (error: any) {
            console.error('Error al editar enlace:', error?.message || error);
            alert(`${t('links_edit_error') || 'No se pudo guardar el enlace'}: ${error?.message || error}`);
        } finally {
            setSavingLinkId(null);
        }
    };

    const handleDeleteLink = async (linkId: string) => {
        if (!user) return;

        const confirmDelete = window.confirm(t('confirm_delete_link') || '¿Estás seguro de que quieres eliminar este enlace?');
        if (!confirmDelete) return;
        
        try {
            await supabase.from('links').delete().eq('id', linkId);
            setLinks(prev => prev.filter(link => link.id !== linkId));
        } catch (error) {
            console.error('Error al eliminar enlace:', error?.message || error || 'Ocurrió un error desconocido');
        }
    };

    const handleToggleActive = async (linkId: string, currentActive: boolean) => {
        if (!user) return;
        
        try {
            await supabase.from('links').update({ isActive: !currentActive }).eq('id', linkId);
            setLinks(prev => prev.map(link => 
                link.id === linkId ? { ...link, isActive: !currentActive } : link
            ));
        } catch (error) {
            console.error('Error al actualizar estado del enlace:', error?.message || error || 'OcurriÃ³ un error desconocido');
        }
    };

    const handleLinkChange = async (linkId: string, field: 'title' | 'url', value: string) => {
        // Sanitize URL for XSS protection if the field is 'url'
        const safeValue = field === 'url' ? sanitizeUrl(value) : value;
        
        // Actualizar estado local inmediatamente
        setLinks(prev => prev.map(link => 
            link.id === linkId ? { ...link, [field]: safeValue } : link
        ));
        
        // Guardar en Firestore
        try {
            await supabase.from('links').update({ [field]: safeValue }).eq('id', linkId);
        } catch (error) {
            console.error('Error al actualizar enlace:', error?.message || error || 'OcurriÃ³ un error desconocido');
            // Revertir el cambio local en caso de error
            setLinks(prev => prev.map(link => 
                link.id === linkId ? { ...link, [field]: link[field] } : link
            ));
        }
    };

    const saveLinkOrder = async (newLinks: UserLink[]) => {
        if (!user) return;

        try {
            for (let i = 0; i < newLinks.length; i++) {
                await supabase.from('links').update({ order: i }).eq('id', newLinks[i].id);
            }
        } catch (error) {
            console.error('Error al guardar el orden de los enlaces:', error);
        }
    };

    const handleContactInfoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setProfileData(prev => ({ ...prev, [name]: value }));
    };

    const handleLocationChange = (index: number, value: string) => {
        setProfileData((prev: any) => {
            const prevAny = prev || {};
            const existing: string[] = Array.isArray(prevAny.locations)
                ? [...prevAny.locations]
                : prevAny.location
                    ? [prevAny.location]
                    : [];

            const normalized = [...existing];
            while (normalized.length < 3) normalized.push('');
            normalized[index] = value;

            const cleaned = normalized.filter((loc) => loc.trim() !== '');

            return {
                ...prevAny,
                locations: cleaned,
                location: cleaned[0] || ''
            };
        });
    };

    // ── Archivos digitales (ULTRA) ──────────────────────────────
    const persistDigitalFiles = async (files: any[]) => {
        if (!user) return;
        const { error } = await supabase.from('profiles').update({ digitalFiles: files }).eq('id', user.id);
        if (error) {
            console.error('Error al guardar archivos:', error.message);
            alert(`No se pudieron guardar los archivos: ${error.message}.\n\nSi dice que falta la columna, ejecuta add_missing_columns.sql en Supabase.`);
        }
    };

    const handleDigitalFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        const fileList = Array.from(event.target.files || []);
        if (fileList.length === 0) return;
        setIsUploadingFile(true);
        try {
            const current = Array.isArray(profileData?.digitalFiles) ? profileData.digitalFiles : [];
            const uploaded: any[] = [];
            for (const file of fileList) {
                const path = `digital_files/${user.id}/${Date.now()}_${file.name}`;
                const { error } = await supabase.storage.from('assets').upload(path, file);
                if (error) throw error;
                const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(path);
                uploaded.push({
                    id: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                    title: file.name,
                    fileType: (file.name.split('.').pop() || 'file').toLowerCase(),
                    size: file.size,
                    url: publicUrl,
                });
            }
            const next = [...current, ...uploaded];
            setProfileData((prev: any) => ({ ...prev, digitalFiles: next }));
            await persistDigitalFiles(next);
        } catch (error: any) {
            console.error('Error al subir archivo:', error?.message || error);
            alert(`No se pudo subir el archivo: ${error?.message || error}`);
        } finally {
            setIsUploadingFile(false);
            event.target.value = '';
        }
    };

    const handleDeleteDigitalFile = async (id: string) => {
        const current = Array.isArray(profileData?.digitalFiles) ? profileData.digitalFiles : [];
        const next = current.filter((f: any) => f.id !== id);
        setProfileData((prev: any) => ({ ...prev, digitalFiles: next }));
        await persistDigitalFiles(next);
    };

    const generateVCard = () => {
        const website = profileData.socialMedia?.website?.trim();
        const vCardLines = [
            'BEGIN:VCARD',
            'VERSION:3.0',
            `FN:${profileData.displayName || ''}`,
            `EMAIL:${profileData.contactEmail || ''}`,
            `TEL:${profileData.phone || ''}`,
            `TEL;TYPE=CELL:${profileData.whatsapp || ''}`,
        ];

        const locationsForVCard = Array.isArray(profileData.locations) && profileData.locations.length > 0
            ? profileData.locations
            : profileData.location
                ? [profileData.location]
                : [];

        if (locationsForVCard.length > 0) {
            locationsForVCard.forEach((loc: string) => {
                vCardLines.push(`ADR;TYPE=WORK:;;${loc};;;`);
            });
        } else {
            vCardLines.push('ADR;TYPE=WORK:;;;;;');
        }

        if (website) {
            vCardLines.push(`URL:${website}`);
        }

        vCardLines.push('END:VCARD');

        const vCardData = vCardLines.join('\n');
        
        const blob = new Blob([vCardData], { type: 'text/vcard' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${profileData.displayName || 'contacto'}.vcf`;
        link.click();
        window.URL.revokeObjectURL(url);
    };

    const handleProductImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        const file = event.target.files?.[0];
        if (!file) return;

        const productId = editingProduct?.id || Date.now().toString();
        try {
            const { data, error } = await supabase.storage.from('assets').upload(`products/${user.id}/${productId}`, file, { upsert: true });
            if (error) throw error;
            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`products/${user.id}/${productId}`);
            const downloadURL = publicUrl;
            setNewProduct(prev => ({ ...prev, imageURL: downloadURL }));
        } catch (error) {
            console.error('Error al subir imagen del producto:', error?.message || error || 'OcurriÃ³ un error desconocido');
        }
    };

    const handleAddProduct = async () => {
        if (!user || !newProduct.name) return;
        
        // Verificar lÃ­mite de productos segÃºn el plan
        const currentProductCount = (profileData.products || []).length;
        let maxProducts = 0;
        if (profileData.plan === 'ultra') {
            maxProducts = 15;
        } else if (profileData.plan === 'pro') {
            maxProducts = 5;
        } else {
            alert(t('products_pro_required'));
            return;
        }
        
        if (currentProductCount >= maxProducts) {
            alert(t('products_limit_reached', { max: String(maxProducts), upgradeMsg: profileData.plan === 'pro' ? t('upgrade_to_ultra') : '' }));
            return;
        }
        
        const product: Product = {
            id: Date.now().toString(),
            name: newProduct.name,
            shortDescription: newProduct.shortDescription || '',
            longDescription: newProduct.longDescription || '',
            price: newProduct.price || '',
            imageURL: newProduct.imageURL || '',
            linkURL: newProduct.linkURL || '',
        };
        const updatedProducts = [...(profileData.products || []), product];
        setProfileData(prev => ({ ...prev, products: updatedProducts }));
        setNewProduct({});
        setIsAddingProduct(false);
        await supabase.from('profiles').update({ products: updatedProducts }).eq('id', user.id);
    };

    const handleUpdateProduct = async () => {
        if (!user || !editingProduct || !newProduct.name) return;
        const updatedProduct: Product = {
            ...editingProduct,
            name: newProduct.name,
            shortDescription: newProduct.shortDescription || '',
            longDescription: newProduct.longDescription || '',
            price: newProduct.price || '',
            imageURL: newProduct.imageURL || editingProduct.imageURL,
            linkURL: newProduct.linkURL || '',
        };
        // Remove the old description property if it exists
        delete (updatedProduct as any).description;
        const updatedProducts = (profileData.products || []).map(p => p.id === editingProduct.id ? updatedProduct : p);
        setProfileData(prev => ({ ...prev, products: updatedProducts }));
        setNewProduct({});
        setEditingProduct(null);
        await supabase.from('profiles').update({ products: updatedProducts }).eq('id', user.id);
    };

    const handleDeleteProduct = async (productId: string) => {
        if (!user) return;
        const updatedProducts = (profileData.products || []).filter(p => p.id !== productId);
        setProfileData(prev => ({ ...prev, products: updatedProducts }));
        await supabase.from('profiles').update({ products: updatedProducts }).eq('id', user.id);
    };

    const handleEditProduct = (product: Product) => {
        setEditingProduct(product);
        // Migrate old description to shortDescription if it exists
        const productToEdit = { ...product };
        if ((productToEdit as any).description && !productToEdit.shortDescription) {
            productToEdit.shortDescription = (productToEdit as any).description;
            delete (productToEdit as any).description;
        }
        setNewProduct(productToEdit);
        setIsAddingProduct(true);
    };

    return (
        <div className="w-full flex flex-col items-center justify-start px-4 overflow-x-clip pb-24">
            <div className="w-full max-w-md md:max-w-3xl flex flex-col gap-4">
                <div className="animate-fade-in-up flex flex-col items-center text-center">
                    <h2 className="text-2xl font-bold font-sans text-[#ffefe5] w-full">
                        {t('links_tab_title')}
                    </h2>
                    <p className="text-sm font-sans text-[#ffefe5]/70 mt-1 md:mt-2">
                        {t('links_management_subtitle')}
                    </p>
                </div>
            
            {/* Sección 1: Formulario Añadir Enlace */}
            <section className="animate-fade-in-up">
                <Card>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-[#ff6600] text-white rounded-xl shadow-lg shadow-[#ff6600]/20 flex items-center justify-center min-h-[36px] w-[36px]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </div>
                        <h3 className="font-bold text-lg font-sans text-[#ffefe5]">{t('add_new_link')}</h3>
                    </div>
                    <form onSubmit={handleAddLink} className="space-y-4">
                        <div className="grid grid-cols-1 gap-3">
                            <Input
                                id="link-title"
                                label={t('link_title_label')}
                                value={newLink.title}
                                onChange={(e) => setNewLink(prev => ({ ...prev, title: e.target.value }))}
                                placeholder={t('link_title_placeholder')}
                                className="text-lg font-bold"
                            />
                            <Input
                                id="link-url"
                                label={t('link_url_label')}
                                value={newLink.url}
                                onChange={(e) => setNewLink(prev => ({ ...prev, url: e.target.value }))}
                                placeholder="https://ejemplo.com"
                                className="font-medium"
                            />
                        </div>
                        <Button 
                            type="submit" 
                            className="w-full"
                        >
                            {t('add_link_button')}
                        </Button>
                    </form>
                </Card>
            </section>

            {/* Sección 2: Lista de Enlaces */}
            <section className="space-y-6 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <div className="flex flex-col items-center justify-center gap-3 px-2 sm:flex-row sm:justify-between text-center">
                    <h3 className="font-bold text-xl text-[#ffefe5] font-sans">{t('my_links')}</h3>
                    <span className="text-sm text-white/40 font-medium">{links.length} {t('tab_links')}</span>
                </div>
                
                {links.length > 0 ? (
                    <div className="flex flex-col gap-3 w-full">
                        {links.map((link, index) => (
                            <div key={link.id} className="w-full">
                                <Card 
                                    className={`group relative overflow-hidden transition-all duration-300 hover:border-[#ff6600]/30 active:scale-[0.98] !p-0 flex flex-col ${draggedLinkIndex === index ? 'opacity-40 scale-95 border-[#ff6600]' : ''}`}
                                draggable
                                onDragStart={() => setDraggedLinkIndex(index)}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    if (draggedLinkIndex === null || draggedLinkIndex === index) return;
                                    const newLinks = [...links];
                                    const [draggedItem] = newLinks.splice(draggedLinkIndex, 1);
                                    newLinks.splice(index, 0, draggedItem);
                                    setLinks(newLinks);
                                    setDraggedLinkIndex(index);
                                }}
                                onDragEnd={() => {
                                    setDraggedLinkIndex(null);
                                    // Functional state update ensures we get the LATEST links even if onDragEnd fires before a re-render
                                    setLinks(prev => {
                                        saveLinkOrder(prev);
                                        return prev;
                                    });
                                }}
                            >
                                <div className="flex flex-col">
                                    {/* Main Content Area */}
                                    <div className="p-3 sm:p-4">
                                        {editingLinkId === link.id ? (
                                            /* Edición en línea: título + URL */
                                            <div className="space-y-2.5">
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">
                                                        {t('link_title_label')}
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={editLinkDraft.title}
                                                        onChange={(e) => setEditLinkDraft(prev => ({ ...prev, title: e.target.value }))}
                                                        className="w-full bg-black/40 border border-[#ff6600]/25 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ff6600] placeholder-white/25"
                                                        placeholder={t('link_title_label')}
                                                        autoFocus
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">
                                                        URL
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={editLinkDraft.url}
                                                        onChange={(e) => setEditLinkDraft(prev => ({ ...prev, url: e.target.value }))}
                                                        className="w-full bg-black/40 border border-[#ff6600]/25 text-white text-xs font-mono rounded-xl px-3 py-2.5 focus:outline-none focus:border-[#ff6600] placeholder-white/25"
                                                        placeholder="https://..."
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex items-center justify-between gap-3 mb-3">
                                                    <h4 className="font-bold text-[#ffefe5] text-base sm:text-lg truncate font-sans flex-1">{link.title}</h4>
                                                    <div className="shrink-0">
                                                        <ToggleSwitch
                                                            checked={link.isActive !== false}
                                                            onChange={() => handleToggleActive(link.id, link.isActive || false)}
                                                        />
                                                    </div>
                                                </div>
                                                <div className="relative group/url">
                                                    <p className="text-[10px] text-[var(--text-muted)] break-all font-mono bg-black/30 p-2 sm:p-2.5 rounded-xl border border-white/5 pr-8">
                                                        {link.url}
                                                    </p>
                                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] group-hover/url:text-[var(--primary-orange)] transition-colors">
                                                        <ExternalLink size={12} />
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>

                                    {/* Actions Area */}
                                    {editingLinkId === link.id ? (
                                        <div className="relative flex items-stretch border-t border-white/5 bg-black/20">
                                            <div className="flex-1 grid grid-cols-2 divide-x divide-white/5">
                                                <button
                                                    onClick={cancelEditLink}
                                                    disabled={savingLinkId === link.id}
                                                    className="flex items-center justify-center gap-2 py-3 px-2 text-[#ffefe5]/60 hover:text-white transition-all active:bg-white/5 h-full min-h-[44px] disabled:opacity-50"
                                                >
                                                    <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">
                                                        {t('cancel') || 'Cancelar'}
                                                    </span>
                                                </button>
                                                <button
                                                    onClick={() => handleSaveLinkEdit(link.id)}
                                                    disabled={savingLinkId === link.id}
                                                    className="flex items-center justify-center gap-2 py-3 px-2 text-[#ff6600] hover:text-[#ff8533] transition-all active:bg-[#ff6600]/10 h-full min-h-[44px] disabled:opacity-50"
                                                >
                                                    <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-widest">
                                                        {savingLinkId === link.id ? (t('saving') || 'Guardando...') : (t('save') || 'Guardar')}
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                    <div className="relative flex items-stretch border-t border-white/5 bg-black/20">
                                        <div className="flex-1 grid grid-cols-2 divide-x divide-white/5 pr-[56px]">
                                            <button
                                                onClick={() => startEditLink(link)}
                                                className="flex items-center justify-center gap-1.5 sm:gap-2 py-3 px-2 text-[#ffefe5]/60 hover:text-white transition-all active:bg-white/5 h-full min-h-[44px]"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">{t('edit')}</span>
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteLink(link.id)}
                                                className="flex items-center justify-center gap-1.5 sm:gap-2 py-3 px-2 text-red-500 hover:text-red-400 transition-all active:bg-red-500/10 h-full min-h-[44px]"
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest">{t('delete')}</span>
                                            </button>
                                        </div>
                                        
                                        {/* Drag Handle */}
                                        <div className="absolute right-0 top-0 bottom-0 w-[56px] flex items-center justify-center cursor-grab active:cursor-grabbing text-white/20 hover:text-white/60 transition-colors border-l border-white/5 bg-white/5">
                                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                                        </div>
                                    </div>
                                    )}
                                </div>
                            </Card>
                            </div>
                        ))}
                    </div>
                ) : (
                    <Card className="flex flex-col items-center justify-center py-12 border-dashed border-2 border-[var(--dark-orange)]/20 shadow-none bg-transparent">
                        <div className="p-5 bg-[var(--background-elevated)] rounded-full text-[var(--dark-orange)] mb-4">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </div>
                        <p className="text-[var(--text-muted)] font-bold">{t('add_first_link_prompt')}</p>
                    </Card>
                )}
            </section>

            {/* Separador Visual */}
            <div className="h-px bg-gradient-to-r from-transparent via-[var(--dark-orange)]/30 to-transparent my-6" />

            {/* Sección Redes Sociales */}
            <section className="animate-fade-in-up" style={{ animationDelay: '0.3s' }}>
                <Card>
                    <div className="flex flex-col sm:flex-row items-center sm:justify-start justify-center gap-3 mb-5 text-center sm:text-left">
                        <div className="p-2 bg-[#ff6600] text-white rounded-xl shadow-lg shadow-[#ff6600]/20 flex items-center justify-center min-h-[36px] w-[36px]">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                        </div>
                        <h3 className="font-bold text-lg font-sans text-[#ffefe5]">{t('social_media_title')}</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[
                            { id: 'instagram', label: 'Instagram', placeholder: '@usuario' },
                            { id: 'twitter', label: 'Twitter / X', placeholder: '@usuario' },
                            { id: 'linkedin', label: 'LinkedIn', placeholder: 'usuario' },
                            { id: 'facebook', label: 'Facebook', placeholder: 'usuario' },
                            { id: 'youtube', label: 'YouTube', placeholder: '@canal' },
                            { id: 'tiktok', label: 'TikTok', placeholder: '@usuario' },
                            { id: 'github', label: 'GitHub', placeholder: 'usuario' }
                        ].map((platform) => (
                            <Input
                                key={platform.id}
                                id={platform.id}
                                label={platform.label}
                                value={profileData.socialMedia?.[platform.id] || ''}
                                onChange={(e) => setProfileData(prev => ({ 
                                    ...prev, 
                                    socialMedia: { ...prev.socialMedia, [platform.id]: e.target.value } 
                                }))}
                                placeholder={platform.placeholder}
                            />
                        ))}
                        <Input
                            id="website"
                            label={t('website_label')}
                            value={profileData.socialMedia?.website || ''}
                            onChange={(e) => setProfileData(prev => ({ 
                                ...prev, 
                                socialMedia: { ...prev.socialMedia, website: e.target.value } 
                            }))}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="mt-6 flex items-center justify-end gap-3">
                        {socialSaveStatus === 'success' && (
                            <span className="text-green-400 text-sm font-medium animate-fade-in-up">✓ Redes sociales guardadas</span>
                        )}
                        {socialSaveStatus === 'error' && (
                            <span className="text-red-400 text-sm font-medium animate-fade-in-up">✗ Error al guardar. Ejecuta add_missing_columns.sql en Supabase.</span>
                        )}
                        <button
                            onClick={handleSaveSocialMedia}
                            disabled={isSavingSocial}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#ff6600] hover:bg-[#ff6600]/90 text-white text-sm font-bold uppercase tracking-wider transition-all active:scale-95 disabled:opacity-60 shadow-lg shadow-[#ff6600]/20"
                        >
                            {isSavingSocial ? 'Guardando...' : 'Guardar redes sociales'}
                        </button>
                    </div>
                </Card>
            </section>

            {/* Sección 4: Productos/Servicios - Solo PRO y ULTRA.
                En restaurantes (gastro) el menú se gestiona en "Menú y Mesas".
                En barbería (barber) los servicios se gestionan en la pestaña "Servicios".
                Ocultamos esta sección para no duplicarla en esos temas. */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && profileData?.theme !== 'gastro' && profileData?.theme !== 'petcare' && profileData?.theme !== 'medical' && profileData?.theme !== 'barber' && profileData?.theme !== 'ecom' && profileData?.theme !== 'sublima' && (
                <section className="animate-fade-in-up" style={{ animationDelay: '0.4s' }}>
                    <Card className="!p-6 bg-[#210900] rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[var(--primary-orange)] text-white rounded-xl shadow-lg shadow-[var(--primary-orange)]/20 flex items-center justify-center min-h-[36px] w-[36px]">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                                </div>
                                <h3 className="font-bold text-lg font-sans text-[#ffefe5]">{t('products_services_title')}</h3>
                            </div>
                            <Button 
                                variant={isAddingProduct ? "secondary" : "primary"}
                                onClick={() => setIsAddingProduct(!isAddingProduct)}
                                className="rounded-xl px-6 font-bold min-h-[44px]"
                            >
                                {isAddingProduct ? t('cancel') : t('add_product')}
                            </Button>
                        </div>

                        {isAddingProduct && (
                            <Card className="mb-6 !p-4 border-2 border-[var(--primary-orange)]/30 bg-[var(--background-dark)]/60 animate-in slide-in-from-top duration-300">
                                <h4 className="text-white font-black text-base mb-4 uppercase italic font-tomorrow tracking-widest border-b border-[var(--dark-orange)]/20 pb-3">
                                    {editingProduct ? t('edit_product') : t('new_product')}
                                </h4>
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Input
                                            label={t('product_name_label')}
                                            value={newProduct.name || ''}
                                            onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                                            className="!bg-[var(--background-dark)] border-[var(--dark-orange)]/30 text-white font-bold"
                                        />
                                        <Input
                                            label={t('product_price_label')}
                                            value={newProduct.price || ''}
                                            onChange={(e) => setNewProduct(prev => ({ ...prev, price: e.target.value }))}
                                            placeholder={t('price_placeholder')}
                                            className="!bg-[var(--background-dark)] border-[var(--dark-orange)]/30 text-white font-bold"
                                        />
                                    </div>
                                    <Input
                                        label={t('product_short_desc_label')}
                                        value={newProduct.shortDescription || ''}
                                        onChange={(e) => setNewProduct(prev => ({ ...prev, shortDescription: e.target.value }))}
                                        placeholder={t('short_desc_placeholder')}
                                        className="!bg-[var(--background-dark)] border-[var(--dark-orange)]/30 text-white font-bold"
                                    />
                                    {/* Gastro: categoría (platos fuertes, postres, bebidas…) y alérgenos */}
                                    {(profileData?.theme === 'gastro' || profileData?.theme === 'petcare' || profileData?.theme === 'medical') && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <Input
                                                label="Categoría (ej. Platos Fuertes, Postres)"
                                                value={newProduct.category || ''}
                                                onChange={(e) => setNewProduct(prev => ({ ...prev, category: e.target.value }))}
                                                placeholder="Platos Fuertes"
                                                className="!bg-[var(--background-dark)] border-[var(--dark-orange)]/30 text-white font-bold"
                                            />
                                            <Input
                                                label="Alérgenos"
                                                value={newProduct.allergens || ''}
                                                onChange={(e) => setNewProduct(prev => ({ ...prev, allergens: e.target.value }))}
                                                placeholder="Gluten, lácteos, frutos secos…"
                                                className="!bg-[var(--background-dark)] border-[var(--dark-orange)]/30 text-white font-bold"
                                            />
                                        </div>
                                    )}
                                    <Textarea
                                        label={t('product_long_desc_label')}
                                        value={newProduct.longDescription || ''}
                                        onChange={(e) => setNewProduct(prev => ({ ...prev, longDescription: e.target.value }))}
                                        placeholder={t('long_desc_placeholder')}
                                        className="!bg-[var(--background-dark)] border-[var(--dark-orange)]/30 text-white font-bold min-h-[120px]"
                                    />
                                    <Input
                                        label={t('product_link_label')}
                                        value={newProduct.linkURL || ''}
                                        onChange={(e) => setNewProduct(prev => ({ ...prev, linkURL: e.target.value }))}
                                        placeholder={t('product_link_placeholder')}
                                        className="!bg-[var(--background-dark)] border-[var(--dark-orange)]/30 text-white font-bold"
                                    />
                                    
                                    <div className="space-y-3">
                                        <label className="block text-xs font-black uppercase tracking-widest text-[var(--text-muted)] font-tomorrow italic">{t('product_image_label')}</label>
                                        <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-[var(--background-dark)]/40 border-2 border-dashed border-[var(--dark-orange)]/20 rounded-2xl transition-all hover:border-[var(--primary-orange)]/40 group">
                                            <div className="relative w-24 h-24 bg-[var(--background-dark)] rounded-xl overflow-hidden border-2 border-[var(--dark-orange)]/20 shadow-inner group-hover:border-[var(--primary-orange)]/30 transition-all">
                                                {newProduct.imageURL ? (
                                                    <img src={newProduct.imageURL} alt="Preview" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--primary-orange)]/60 transition-colors">
                                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                                        <span className="text-[10px] mt-2 font-black uppercase italic tracking-tighter">Imagen</span>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="flex-1 w-full sm:w-auto">
                                                <input 
                                                    type="file" 
                                                    accept="image/*" 
                                                    onChange={handleProductImageUpload} 
                                                    className="hidden" 
                                                    id="product-image-upload"
                                                />
                                                <label 
                                                    htmlFor="product-image-upload"
                                                    className="inline-flex items-center justify-center w-full px-6 py-3 bg-[var(--background-elevated)] text-white font-bold rounded-xl border border-[var(--dark-orange)]/30 hover:bg-[var(--background-card)] hover:border-[var(--primary-orange)] cursor-pointer transition-all active:scale-[0.98]"
                                                >
                                                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
                                                    {t('upload_select_image')}
                                                </label>
                                                <p className="text-[10px] text-[var(--text-muted)] mt-3 italic font-medium leading-tight">{t('image_format_hint')}</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-4 flex flex-col sm:flex-row gap-3">
                                        <Button
                                            onClick={editingProduct ? handleUpdateProduct : handleAddProduct}
                                            className="flex-1 rounded-xl font-black uppercase tracking-wider italic shadow-xl shadow-[var(--primary-orange)]/20"
                                        >
                                            {editingProduct ? t('update_product') : t('publish_product')}
                                        </Button>
                                        {editingProduct && (
                                            <Button 
                                                variant="secondary"
                                                onClick={() => {
                                                    setEditingProduct(null);
                                                    setNewProduct({});
                                                    setIsAddingProduct(false);
                                                }}
                                                className="rounded-xl px-8"
                                            >
                                                {t('cancel')}
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            </Card>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(profileData.products && profileData.products.length > 0) ? (
                                profileData.products.map((product: Product) => (
                                    <Card 
                                        key={product.id} 
                                        className="group relative !p-0 overflow-hidden border-2 border-[var(--dark-orange)]/20 hover:border-[var(--primary-orange)]/40 transition-all duration-500 hover:shadow-2xl hover:shadow-[var(--primary-orange)]/5 flex flex-col h-full bg-[#1a0a03]/60"
                                    >
                                        <div className="relative aspect-video overflow-hidden border-b border-[var(--dark-orange)]/10">
                                            {product.imageURL ? (
                                                <img
                                                    src={product.imageURL}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-[var(--background-dark)] flex items-center justify-center text-[var(--dark-orange)]/40">
                                                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                            {product.price && (
                                                <div className="absolute top-4 right-4 bg-[var(--primary-orange)] text-white text-xs font-black px-3 py-1.5 rounded-full shadow-lg shadow-black/40 uppercase italic tracking-tighter">
                                                    {product.price}
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-5 flex-grow flex flex-col">
                                            <h4 className="font-black text-white text-lg mb-2 uppercase italic font-tomorrow tracking-tight line-clamp-1">{product.name}</h4>
                                            <p className="text-[var(--text-muted)] text-sm line-clamp-2 mb-6 flex-grow font-medium leading-relaxed">{product.shortDescription || 'Sin descripción'}</p>
                                            
                                            <div className="grid grid-cols-2 gap-3 mt-auto pt-4 border-t border-[var(--dark-orange)]/10">
                                                <button 
                                                    onClick={() => handleEditProduct(product)}
                                                    className="py-2.5 text-[10px] font-black uppercase tracking-widest bg-[var(--background-elevated)] hover:bg-[var(--background-card)] text-white rounded-xl transition-all border border-[var(--dark-orange)]/20 active:scale-95"
                                                >
                                                    {t('edit_product') || 'Editar'}
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteProduct(product.id)}
                                                    className="py-2.5 flex items-center justify-center text-[var(--text-muted)] hover:text-red-500 bg-red-500/5 hover:bg-red-500/10 rounded-xl transition-all border border-transparent active:scale-95"
                                                >
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </Card>
                                ))
                            ) : (
                                <div className="col-span-full py-16 text-center bg-[var(--background-dark)]/40 border-2 border-dashed border-[var(--dark-orange)]/20 rounded-3xl group hover:border-[var(--primary-orange)]/30 transition-colors">
                                    <div className="inline-flex p-4 bg-[var(--background-elevated)] rounded-full text-[var(--dark-orange)]/40 mb-4 group-hover:scale-110 transition-transform">
                                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                                    </div>
                                    <p className="text-[var(--text-muted)] font-bold italic lowercase first-letter:uppercase">No hay productos o servicios registrados.</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </section>
            )}

            {/* SECCIÓN TESTIMONIOS - Solo PRO y ULTRA */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <section className="animate-fade-in-up" style={{ animationDelay: '0.6s' }}>
                    <Card>
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-8">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[#ff6600] text-white rounded-2xl shadow-lg shadow-[#ff6600]/20 flex items-center justify-center min-h-[48px] w-[48px]">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                                </div>
                                <h3 className="font-bold text-xl font-sans text-[#ffefe5]">{t('testimonials_title')}</h3>
                            </div>
                            <Button 
                                onClick={() => openTestimonialForm()} 
                                className="w-full sm:w-auto"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                                {t('add_testimonial')}
                            </Button>
                        </div>
                        
                        {/* Testimonios Pendientes */}
                        {pendingTestimonials && pendingTestimonials.length > 0 && (
                            <div className="mb-8 p-6 bg-[var(--primary-orange)]/5 border-2 border-[var(--primary-orange)]/20 rounded-3xl animate-pulse-subtle">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="w-2.5 h-2.5 bg-[var(--primary-orange)] rounded-full animate-pulse" />
                                    <h4 className="text-[var(--primary-orange)] font-black uppercase italic tracking-widest text-sm font-tomorrow">
                                        {t('pending_approval')} ({pendingTestimonials.length})
                                    </h4>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {pendingTestimonials.map((testimonial) => (
                                        <Card key={testimonial.id} className="!p-5 bg-black/40 border border-[var(--primary-orange)]/20">
                                            <p className="text-[var(--text-muted)] text-sm italic mb-4 leading-relaxed">"{testimonial.quote}"</p>
                                            <div className="flex items-center justify-between border-t border-[var(--primary-orange)]/10 pt-4">
                                                <span className="text-white font-bold text-xs uppercase italic tracking-wider">- {testimonial.author}</span>
                                                <div className="flex gap-2">
                                                    <button onClick={() => handleApproveTestimonial(testimonial)} className="bg-green-500/20 hover:bg-green-500/40 text-green-400 p-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-green-500/10 border border-green-500/30 min-h-[48px] min-w-[48px] flex items-center justify-center">
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>
                                                    </button>
                                                    <button onClick={() => handleRejectTestimonial(testimonial.id)} className="bg-red-500/20 hover:bg-red-500/40 text-red-400 p-3 rounded-xl transition-all active:scale-95 shadow-lg shadow-red-500/10 border border-red-500/30 min-h-[48px] min-w-[48px] flex items-center justify-center">
                                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </Card>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {/* Lista de Testimonios Aprobados */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {(profileData?.testimonials || []).map((testimonial: Testimonial) => (
                                <Card key={testimonial.id} className="relative group p-6 bg-black/20 border-[#962700]/10 hover:border-[#ff6600]/30 transition-all duration-500">
                                    <div className="absolute -top-3 -left-3 text-5xl text-[var(--primary-orange)]/10 font-serif leading-none opacity-50 select-none">“</div>
                                    <p className="text-white text-sm italic mb-6 leading-relaxed relative z-10">"{testimonial.quote}"</p>
                                    <div className="flex items-center justify-between border-t border-white/5 pt-5">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                {testimonial.authorImageURL ? (
                                                    <img src={testimonial.authorImageURL} alt={testimonial.author} className="w-10 h-10 rounded-2xl object-cover ring-2 ring-[#ff6600]/20 group-hover:ring-[#ff6600] transition-all" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-2xl bg-[#ffefe5]/5 flex items-center justify-center text-[#ff6600]/40 text-xs font-black ring-2 ring-white/5">
                                                        {testimonial.author.charAt(0)}
                                                    </div>
                                                )}
                                                <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 border-2 border-[#210900] rounded-full shadow-lg" />
                                            </div>
                                            <div>
                                                <p className="text-white text-sm font-black uppercase italic font-tomorrow tracking-tight mb-0.5">{testimonial.author}</p>
                                                <p className="text-[var(--text-muted)] text-[10px] font-bold uppercase tracking-widest">{testimonial.authorTitle}</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <button onClick={() => openTestimonialForm(testimonial)} className="p-3 text-[#ffefe5]/50 hover:text-[#ff6600] transition-colors hover:scale-110 active:scale-95 min-h-[48px] min-w-[48px] flex items-center justify-center">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                                            </button>
                                            <button onClick={() => handleDeleteTestimonial(testimonial.id)} className="p-3 text-[#ffefe5]/50 hover:text-red-500 transition-colors hover:scale-110 active:scale-95 min-h-[48px] min-w-[48px] flex items-center justify-center">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                </Card>
                            ))}
                            {(!profileData?.testimonials || profileData.testimonials.length === 0) && (
                                <div className="col-span-full py-16 text-center bg-[var(--background-dark)]/20 border-2 border-dashed border-[var(--dark-orange)]/10 rounded-3xl">
                                    <p className="text-[var(--text-muted)] font-black uppercase italic font-tomorrow tracking-tight">Aún no tienes testimonios aprobados.</p>
                                    <p className="text-[var(--text-muted)] text-[10px] mt-2 uppercase font-bold tracking-widest">Añade los primeros usando el botón superior.</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </section>
            )}

            {/* SECCIÓN ARCHIVOS DIGITALES - Solo ULTRA */}
            {profileData?.plan === 'ultra' && (
                <section className="animate-fade-in-up" style={{ animationDelay: '0.7s' }}>
                    <Card>
                        <div className="flex items-center gap-4 mb-10">
                            <div className="p-3 bg-[#ff6600] text-white rounded-2xl shadow-lg shadow-[#ff6600]/20 flex items-center justify-center min-h-[48px] w-[48px]">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                            </div>
                            <h3 className="font-bold text-xl font-sans text-[#ffefe5]">{t('digital_files')}</h3>
                        </div>
                        
                        <div className="relative group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-[#ff6600] to-transparent rounded-3xl blur opacity-10 group-hover:opacity-20 transition-all duration-1000" />
                            <div className="relative p-10 bg-black/10 border-2 border-dashed border-[#962700]/20 rounded-3xl text-center group-hover:border-[#ff6600]/40 transition-all duration-500 overflow-hidden">
                                <div className="w-20 h-20 mx-auto mb-8 bg-[#ffefe5]/5 rounded-3xl flex items-center justify-center text-[#ff6600] shadow-inner transform group-hover:scale-110 transition-all duration-500">
                                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                </div>
                                <p className="text-white font-bold uppercase italic font-tomorrow tracking-wider text-lg mb-2">{t('share_your_files')}</p>
                                <p className="text-[#ffefe5]/60 text-sm mb-8 max-w-md mx-auto leading-relaxed">{t('archives_description')}</p>
                                <label className={`w-full inline-flex items-center justify-center px-10 py-3.5 rounded-xl bg-[#ff6600] hover:bg-[#e85a00] text-white font-black text-sm uppercase tracking-wider cursor-pointer transition-all ${isUploadingFile ? 'opacity-60 pointer-events-none' : ''}`}>
                                    {isUploadingFile ? 'Subiendo...' : t('select_files')}
                                    <input type="file" multiple onChange={handleDigitalFileUpload} className="hidden" />
                                </label>
                                <p className="text-[#ffefe5]/30 text-[10px] mt-6 font-bold uppercase tracking-widest italic">{t('file_limit')}</p>
                            </div>
                        </div>

                        {/* Lista de archivos subidos */}
                        {Array.isArray(profileData?.digitalFiles) && profileData.digitalFiles.length > 0 && (
                            <div className="mt-6 space-y-2">
                                {profileData.digitalFiles.map((f: any) => (
                                    <div key={f.id} className="flex items-center gap-3 bg-black/20 border border-[#962700]/15 rounded-xl p-3">
                                        <div className="w-10 h-10 rounded-lg bg-[#ff6600]/10 border border-[#ff6600]/20 flex items-center justify-center text-[#ff6600] text-xs font-black uppercase shrink-0">
                                            {(f.fileType || 'file').slice(0, 4)}
                                        </div>
                                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="flex-1 min-w-0 text-sm text-[#ffefe5] truncate hover:text-[#ff6600] transition">
                                            {f.title}
                                        </a>
                                        <button onClick={() => handleDeleteDigitalFile(f.id)}
                                            className="w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center hover:bg-red-500/20 transition shrink-0">
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </section>
            )}

            {/* SECCIÓN VIDEOS DESTACADOS - Solo ULTRA */}
            {isUltra && (
                <section className="animate-fade-in-up" style={{ animationDelay: '0.75s' }}>
                    <Card>
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-3 bg-[#ff6600] text-white rounded-2xl shadow-lg shadow-[#ff6600]/20 flex items-center justify-center min-h-[48px] w-[48px]">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
                            </div>
                            <div>
                                <h3 className="font-bold text-xl font-sans text-[#ffefe5]">Videos Destacados</h3>
                                <p className="text-xs text-[#ffefe5]/40 mt-0.5">Hasta 2 videos · cualquier plataforma</p>
                            </div>
                        </div>

                        {/* Orientación */}
                        <div className="mb-6">
                            <label className="block text-xs font-black uppercase tracking-widest text-[#ff6600]/60 mb-2">Orientación</label>
                            <div className="flex gap-3">
                                {(['horizontal', 'vertical'] as const).map(o => (
                                    <button key={o} type="button"
                                        onClick={() => setProfileData((prev: any) => ({ ...prev, videoOrientation: o }))}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-black uppercase tracking-wider border transition-all ${
                                            (profileData?.videoOrientation || 'horizontal') === o
                                                ? 'bg-[#ff6600]/15 border-[#ff6600]/50 text-[#ff6600]'
                                                : 'bg-black/10 border-[#962700]/20 text-[#ffefe5]/40'
                                        }`}>
                                        {o === 'horizontal' ? '⬛ Horizontal' : '◼ Vertical'}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-[#ffefe5]/25 mt-2 font-bold uppercase tracking-widest">
                                Vertical: 2 tarjetas lado a lado · Horizontal: una sobre la otra
                            </p>
                        </div>

                        {/* Slots de video */}
                        <div className="space-y-5">
                            {([0, 1] as const).map((index) => {
                                const videos: Array<{ url: string; thumbnailURL?: string }> =
                                    Array.isArray(profileData?.featuredVideos) ? profileData.featuredVideos : [];
                                const video = videos[index];

                                if (index === 1 && videos.length < 1) return null;

                                if (index === 1 && videos.length < 2) {
                                    return (
                                        <button key={index} type="button"
                                            onClick={() => {
                                                const next = [...videos, { url: '', thumbnailURL: '' }];
                                                setProfileData((prev: any) => ({ ...prev, featuredVideos: next }));
                                            }}
                                            className="w-full py-4 rounded-xl border-2 border-dashed border-[#ff6600]/20 text-[#ff6600]/50 hover:border-[#ff6600]/40 hover:text-[#ff6600]/70 transition text-sm font-black uppercase tracking-widest">
                                            + Agregar segundo video
                                        </button>
                                    );
                                }

                                const orientation = profileData?.videoOrientation || 'horizontal';

                                return (
                                    <div key={index} className="bg-black/20 rounded-2xl p-4 border border-[#962700]/20 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black uppercase tracking-widest text-[#ff6600]/60">Video {index + 1}</span>
                                            {(video?.url || video?.thumbnailURL) && (
                                                <button type="button"
                                                    onClick={() => {
                                                        const next = [...videos];
                                                        next.splice(index, 1);
                                                        setProfileData((prev: any) => ({ ...prev, featuredVideos: next }));
                                                    }}
                                                    className="text-xs text-red-400/50 hover:text-red-400 transition font-bold">
                                                    ✕ Quitar
                                                </button>
                                            )}
                                        </div>

                                        {/* URL */}
                                        <input
                                            type="url"
                                            value={video?.url || ''}
                                            onChange={e => updateFeaturedVideo(index, { url: e.target.value })}
                                            placeholder="https://youtube.com/... · instagram.com/reel/... · tiktok.com/..."
                                            className="w-full px-4 py-3 rounded-xl bg-black/20 border border-[#962700]/20 text-[#ffefe5] text-sm placeholder:text-[#ffefe5]/20 focus:outline-none focus:border-[#ff6600]/50"
                                        />

                                        {/* Thumbnail */}
                                        <div>
                                            <label className="block text-xs font-black uppercase tracking-widest text-[#ff6600]/40 mb-2">Imagen de portada</label>
                                            {video?.thumbnailURL ? (
                                                <div className="relative rounded-xl overflow-hidden bg-black/30"
                                                    style={{ aspectRatio: orientation === 'vertical' ? '9/16' : '16/9', maxHeight: '180px' }}>
                                                    <img src={video.thumbnailURL} alt="Portada" className="w-full h-full object-cover" />
                                                    <button type="button"
                                                        onClick={() => updateFeaturedVideo(index, { thumbnailURL: '' })}
                                                        className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center text-white/70 hover:text-white text-xs font-bold">
                                                        ✕
                                                    </button>
                                                </div>
                                            ) : (
                                                <label className={`flex items-center justify-center gap-2 py-5 rounded-xl border-2 border-dashed border-[#962700]/30 text-[#ffefe5]/40 hover:border-[#ff6600]/40 hover:text-[#ffefe5]/60 transition cursor-pointer text-sm font-bold ${uploadingThumbnail[index] ? 'opacity-50 pointer-events-none' : ''}`}>
                                                    {uploadingThumbnail[index] ? '⏳ Subiendo...' : '📷 Subir imagen o captura de pantalla'}
                                                    <input type="file" accept="image/*" className="hidden"
                                                        onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoThumbnailUpload(index, f); e.target.value = ''; }}
                                                    />
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </Card>
                </section>
            )}

            {/* SECCIÓN FAQS - Solo PRO y ULTRA */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <section className="animate-fade-in-up" style={{ animationDelay: '0.8s' }}>
                    <Card>
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-[#ff6600] text-white rounded-2xl shadow-lg shadow-[#ff6600]/20 flex items-center justify-center min-h-[48px] w-[48px]">
                                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                                </div>
                                <h3 className="font-bold text-xl font-sans text-[#ffefe5]">{t('faqs_title')}</h3>
                            </div>
                            <Button 
                                onClick={() => {
                                    const newFaqs = [...(profileData?.faqs || []), { question: '', answer: '' }];
                                    setProfileData(prev => ({ ...prev, faqs: newFaqs }));
                                }}
                                className="w-full sm:w-auto"
                            >
                                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                                {t('add_question')}
                            </Button>
                        </div>
                        
                        <div className="space-y-6">
                            {(profileData?.faqs || []).map((faq: any, index: number) => (
                                <Card key={index} className="bg-black/20 border-[#962700]/10 hover:border-[#ff6600]/20 transition-all group relative overflow-hidden">
                                    <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-[#ff6600] to-transparent scale-y-0 group-hover:scale-y-100 transition-transform duration-500" />
                                    <div className="flex justify-between items-start gap-6 mb-6">
                                        <div className="flex-1 space-y-6">
                                            <Input
                                                label={`${t('question_label')} #${index + 1}`}
                                                value={faq.question}
                                                onChange={(e) => {
                                                    const newFaqs = [...(profileData.faqs || [])];
                                                    newFaqs[index].question = e.target.value;
                                                    setProfileData(prev => ({ ...prev, faqs: newFaqs }));
                                                }}
                                                placeholder={t('question_placeholder')}
                                            />
                                            <Textarea
                                                label={t('answer_label')}
                                                value={faq.answer}
                                                onChange={(e) => {
                                                    const newFaqs = [...(profileData.faqs || [])];
                                                    newFaqs[index].answer = e.target.value;
                                                    setProfileData(prev => ({ ...prev, faqs: newFaqs }));
                                                }}
                                                placeholder={t('answer_placeholder')}
                                            />
                                        </div>
                                        <button 
                                            onClick={() => {
                                                const newFaqs = (profileData.faqs || []).filter((_: any, i: number) => i !== index);
                                                setProfileData(prev => ({ ...prev, faqs: newFaqs }));
                                            }}
                                            className="p-3 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl transition-all active:scale-90 min-h-[48px] min-w-[48px] flex items-center justify-center"
                                            title={t('delete_question')}
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                        </button>
                                    </div>
                                </Card>
                            ))}
                            
                            {(profileData?.faqs || []).length === 0 && (
                                <div className="text-center py-16 bg-[var(--background-dark)]/20 border-2 border-dashed border-[var(--dark-orange)]/10 rounded-3xl">
                                    <p className="text-[var(--text-muted)] font-black uppercase italic font-tomorrow tracking-tight">{t('no_faqs_yet')}</p>
                                    <p className="text-[var(--text-muted)] text-[10px] mt-2 uppercase font-bold tracking-widest">{t('faqs_help_text')}</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </section>
            )}

            {/* SECCIÓN ORGANIZAR SECCIONES */}
            <section className="animate-fade-in-up" style={{ animationDelay: '0.9s' }}>
                <Card>
                    <div className="flex items-center gap-4 mb-10">
                        <div className="p-3 bg-[#ff6600] text-white rounded-2xl shadow-lg shadow-[#ff6600]/20 flex items-center justify-center min-h-[48px] w-[48px]">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
                        </div>
                        <h3 className="font-bold text-xl font-sans text-[#ffefe5]">{t('section_organizer_title')}</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {[
                            { id: 'links', label: t('section_links'), icon: <Link className="w-5 h-5" /> },
                            { id: 'contact', label: t('section_contact'), icon: <Phone className="w-5 h-5" /> },
                            { id: 'social', label: t('section_social'), icon: <Globe className="w-5 h-5" /> },
                            { id: 'products', label: t('section_products'), icon: <ShoppingBag className="w-5 h-5" />, pro: true },
                            { id: 'gallery', label: t('section_gallery'), icon: <Images className="w-5 h-5" />, pro: true },
                            { id: 'testimonials', label: t('section_testimonials'), icon: <MessageCircle className="w-5 h-5" />, pro: true },
                            { id: 'archives', label: t('section_archives'), icon: <FileText className="w-5 h-5" />, ultra: true },
                            { id: 'faqs', label: t('section_faqs'), icon: <HelpCircle className="w-5 h-5" />, pro: true },
                        ].map((section) => {
                            const isVisible = profileData?.sectionVisibility?.[section.id] !== false;
                            const isLocked = (section.ultra && !isUltra) || (section.pro && !profileData?.plan);
                            
                            return (
                                <div key={section.id} className={`group flex items-center justify-between p-5 bg-black/10 hover:bg-black/20 rounded-2xl border-2 border-[#962700]/10 hover:border-[#ff6600]/30 transition-all duration-300 ${isLocked ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-[#ffefe5]/5 flex items-center justify-center text-[#ff6600] shadow-inner transform group-hover:scale-110 transition-transform">
                                            <span className="text-xl">{section.icon}</span>
                                        </div>
                                        <div>
                                            <p className="text-white font-black uppercase italic font-tomorrow tracking-tight text-sm">{section.label}</p>
                                        </div>
                                    </div>
                                    <ToggleSwitch
                                        checked={isVisible}
                                        onChange={() => {
                                            if (isLocked) return;
                                            setProfileData(prev => ({
                                                ...prev,
                                                sectionVisibility: {
                                                    ...prev?.sectionVisibility,
                                                    [section.id]: !isVisible
                                                }
                                            }));
                                        }}
                                        disabled={isLocked}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </Card>
            </section>
            </div>
        </div>
    );
};
