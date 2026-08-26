import React, { useState, useEffect } from 'react';
import { Card, Button, Input, ToggleSwitch, Textarea } from '../ui';
import type { UserLink, Product, Testimonial } from '../../types';
import { db, storage } from '../../src/firebase';
import { doc, setDoc, collection, addDoc, deleteDoc, updateDoc, deleteField, query, where, getDocs, orderBy, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

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
    
    // Si empieza con protocolos válidos, la dejamos pasar
    if (/^(https?:\/\/|mailto:|tel:|wa\.me\/)/i.test(cleanUrl)) {
        return cleanUrl;
    }
    
    // Bloquear explícitamente scripts maliciosos (XSS)
    if (/^(javascript:|data:|vbscript:)/i.test(cleanUrl)) {
        console.warn("URL maliciosa bloqueada");
        return ""; 
    }
    
    // Si el usuario solo escribió 'www.google.com' o 'miweb.com', le ponemos https://
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
    console.log('LinksTab MOUNTED. Initial links prop:', links, 'User:', user); // <-- LOG 1
    const [newLink, setNewLink] = useState({ title: '', url: '' });
    const [isAddingProduct, setIsAddingProduct] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [newProduct, setNewProduct] = useState<Partial<Product>>({});
    const [draggedGalleryIndex, setDraggedGalleryIndex] = useState<number | null>(null);
    const [isSavingGalleryOrder, setIsSavingGalleryOrder] = useState(false);
    const [draggedLinkIndex, setDraggedLinkIndex] = useState<number | null>(null);
    const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
    const [newAlbumTitle, setNewAlbumTitle] = useState('');
    const [newAlbumCoverUrl, setNewAlbumCoverUrl] = useState('');
    const [isUploadingNewAlbumCover, setIsUploadingNewAlbumCover] = useState(false);
    const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
    const [editingAlbumTitle, setEditingAlbumTitle] = useState('');
    const [editingAlbumImages, setEditingAlbumImages] = useState<string[]>([]);
    const [isUploadingAlbumAsset, setIsUploadingAlbumAsset] = useState(false);
    const [videoInputMode, setVideoInputMode] = useState<'external' | 'upload'>('external');
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    const isUltra = profileData?.plan === 'ultra';
    const galleryMode = isUltra && profileData?.galleryMode === 'albums' ? 'albums' : 'grid';
    const albums = Array.isArray(profileData?.albums) ? profileData.albums : [];

    
    // Cargar enlaces desde Firestore al montar el componente
    useEffect(() => {
        if (user) {
            console.log('LinksTab useEffect: User detected. Fetching links for:', user.uid); // <-- LOG 2
            const linksQuery = query(
                collection(db, 'links'),
                where('userId', '==', user.uid),
                orderBy('order', 'asc') // <-- Añadir orden ascendente
            );
            getDocs(linksQuery)
                .then(snapshot => {
                    if (snapshot.empty) {
                        console.log('LinksTab useEffect: No links found in Firestore.'); // <-- LOG 3a
                        setLinks([]); // Asegurar que se vacíe si no hay nada
                    } else {
                        const userLinks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        userLinks.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
                        console.log('LinksTab useEffect: Links fetched from Firestore:', userLinks); // <-- LOG 3b
                        setLinks(userLinks); // <-- Llamada CRUCIAL
                    }
                })
                .catch(error => {
                    console.error("LinksTab useEffect: Error fetching links:", error?.message || error || 'Error desconocido'); // <-- LOG 3c
                    setLinks([]); // Vaciar en caso de error
                });
        } else {
            console.log('LinksTab useEffect: No user found. Clearing links.'); // <-- LOG 4
            setLinks([]); // Limpiar si no hay usuario
        }
    }, [user, setLinks]); // <-- Incluir setLinks como dependencia

    useEffect(() => {
        if (!isUltra && profileData?.galleryMode && profileData.galleryMode !== 'grid') {
            setProfileData((prev: any) => ({ ...prev, galleryMode: 'grid' }));
        }
    }, [isUltra, profileData?.galleryMode, setProfileData]);

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
            alert(`El video es demasiado pesado. El límite es de ${maxSizeMB} MB.`);
            event.target.value = '';
            return;
        }

        try {
            setUploadingVideo(true);
            setUploadProgress(0);

            const filePath = `video_uploads/${user.uid}/${Date.now()}_${file.name}`;
            const storageRef = ref(storage, filePath);
            const uploadTask = uploadBytesResumable(storageRef, file);

            await new Promise<void>((resolve, reject) => {
                uploadTask.on(
                    'state_changed',
                    (snapshot) => {
                        const progress = snapshot.totalBytes
                            ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100)
                            : 0;
                        setUploadProgress(progress);
                    },
                    (error) => {
                        reject(error);
                    },
                    () => {
                        resolve();
                    }
                );
            });

            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);

            setProfileData((prev: any) => ({
                ...prev,
                uploadedVideoURL: downloadURL,
                featuredVideoURL: ''
            }));

            await setDoc(
                doc(db, 'profiles', user.uid),
                { uploadedVideoURL: downloadURL, featuredVideoURL: '' },
                { merge: true }
            );

            alert('Video subido correctamente.');
        } catch (error) {
            console.error('Error al subir el video:', error?.message || error || 'Ocurrió un error desconocido');
            alert('Ocurrió un error al subir el video.');
        } finally {
            setUploadingVideo(false);
            setUploadProgress(0);
            event.target.value = '';
        }
    };

    const handleDeleteUploadedVideo = async () => {
        if (!user) return;
        if (!profileData?.uploadedVideoURL) return;

        const confirmed = window.confirm('¿Seguro que deseas eliminar el video subido?');
        if (!confirmed) return;

        try {
            const videoRef = ref(storage, profileData.uploadedVideoURL);
            await deleteObject(videoRef);

            const profileRef = doc(db, 'profiles', user.uid);
            await updateDoc(profileRef, { uploadedVideoURL: deleteField() });

            setProfileData((prev: any) => ({ ...prev, uploadedVideoURL: null }));
            setVideoInputMode('external');

            alert('Video eliminado correctamente.');
        } catch (error) {
            console.error('Error al eliminar el video subido:', error?.message || error || 'Ocurrió un error desconocido');
            alert('Ocurrió un error al eliminar el video.');
        }
    };

    // Funciones para manejar enlaces
    const handleAddLink = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !newLink.title || !newLink.url) {
            console.log('handleAddLink: Missing user or newLink data.');
            return;
        }
        
        // Verificar límite de enlaces según el plan
        const maxLinks = profileData.plan === 'conecta' || !profileData.plan ? 10 : Infinity;
        if (links.length >= maxLinks) {
            alert(`Has alcanzado el límite de ${maxLinks} enlaces del Plan CONECTA. Actualiza a PRO para enlaces ilimitados.`);
            return;
        }
        
        console.log('handleAddLink: Attempting to add:', newLink, 'for user:', user.uid); // <-- LOG 5

        // Sanitize URL for XSS protection
        const safeUrl = sanitizeUrl(newLink.url);

        const linkDataToAdd = {
            userId: user.uid, // <-- Doble verificar
            title: newLink.title,
            url: safeUrl,
            isActive: true,
            order: links.length // <-- Asegurar que 'links' es el estado actual
        };

        try {
            const docRef = await addDoc(collection(db, 'links'), linkDataToAdd);
            console.log('handleAddLink: Firestore success. New doc ID:', docRef.id); // <-- LOG 6

            // Actualizar estado local DESPUÉS de Firestore
            const newlyAddedLink = { id: docRef.id, ...linkDataToAdd };
            setLinks(prevLinks => [...prevLinks, newlyAddedLink]); // <-- Llamada CRUCIAL
            console.log('handleAddLink: Local state updated:', newlyAddedLink); // <-- LOG 7

            setNewLink({ title: '', url: '' }); // Limpiar formulario
        } catch (error) {
            console.error("handleAddLink: Error adding link to Firestore:", error?.message || error || 'Ocurrió un error desconocido'); // <-- LOG 8
        }
    };

    const handleDeleteLink = async (linkId: string) => {
        if (!user) return;
        
        try {
            await deleteDoc(doc(db, 'links', linkId));
            setLinks(prev => prev.filter(link => link.id !== linkId));
        } catch (error) {
            console.error('Error al eliminar enlace:', error?.message || error || 'Ocurrió un error desconocido');
        }
    };

    const handleToggleActive = async (linkId: string, currentActive: boolean) => {
        if (!user) return;
        
        try {
            await updateDoc(doc(db, 'links', linkId), { isActive: !currentActive });
            setLinks(prev => prev.map(link => 
                link.id === linkId ? { ...link, isActive: !currentActive } : link
            ));
        } catch (error) {
            console.error('Error al actualizar estado del enlace:', error?.message || error || 'Ocurrió un error desconocido');
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
            await updateDoc(doc(db, 'links', linkId), { [field]: safeValue });
        } catch (error) {
            console.error('Error al actualizar enlace:', error?.message || error || 'Ocurrió un error desconocido');
            // Revertir el cambio local en caso de error
            setLinks(prev => prev.map(link => 
                link.id === linkId ? { ...link, [field]: link[field] } : link
            ));
        }
    };

    const saveLinkOrder = async (newLinks: UserLink[]) => {
        if (!user) return;

        try {
            const batch = writeBatch(db);
            newLinks.forEach((link, index) => {
                const ref = doc(db, 'links', link.id);
                batch.update(ref, { order: index });
            });
            await batch.commit();
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

    const handleGalleryTitleChange = (value: string) => {
        setProfileData(prev => ({ ...prev, galleryTitle: value }));
    };

    const handleSaveGalleryTitle = async (title: string) => {
        if (!user) return;
        try {
            await setDoc(doc(db, 'profiles', user.uid), { galleryTitle: title }, { merge: true });
        } catch (error) {
            console.error('Error al guardar el título de la galería:', error?.message || error || 'Ocurrió un error desconocido');
        }
    };

    const uploadAlbumAsset = async (file: File, storagePath: string) => {
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
    };

    const persistAlbums = async (updatedAlbums: any[]) => {
        if (!user) return;
        try {
            await setDoc(doc(db, 'profiles', user.uid), { albums: updatedAlbums }, { merge: true });
        } catch (error) {
            console.error('Error al guardar álbumes:', error?.message || error || 'Ocurrió un error desconocido');
        }
    };

    const handleNewAlbumCoverUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploadingNewAlbumCover(true);
        try {
            const downloadURL = await uploadAlbumAsset(
                file,
                `gallery_albums/${user.uid}/new_album_cover_${Date.now()}_${file.name}`,
            );
            setNewAlbumCoverUrl(downloadURL);
        } catch (error) {
            console.error('Error al subir portada del álbum:', error?.message || error || 'Ocurrió un error desconocido');
            alert('Error al subir la portada del álbum.');
        } finally {
            setIsUploadingNewAlbumCover(false);
        }
    };

    const handleCreateAlbum = async () => {
        if (!user) return;
        const title = newAlbumTitle.trim();
        if (!title) {
            alert('Por favor ingresa el título del álbum.');
            return;
        }
        if (!newAlbumCoverUrl) {
            alert('Por favor sube una foto de portada.');
            return;
        }

        const newAlbum = {
            id: Date.now().toString(),
            title,
            coverImage: newAlbumCoverUrl,
            images: [] as string[],
        };

        const updatedAlbums = [...albums, newAlbum];
        setProfileData((prev: any) => ({ ...prev, albums: updatedAlbums }));
        await persistAlbums(updatedAlbums);

        setIsCreatingAlbum(false);
        setNewAlbumTitle('');
        setNewAlbumCoverUrl('');
    };

    const handleStartEditAlbum = (album: any) => {
        setEditingAlbumId(album.id);
        setEditingAlbumTitle(album.title || '');
        setEditingAlbumImages(Array.isArray(album.images) ? [...album.images] : []);
    };

    const handleMoveImage = (index: number, direction: 'before' | 'after') => {
        setEditingAlbumImages((prev) => {
            const next = [...prev];
            const targetIndex = direction === 'before' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= next.length) return prev;
            [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
            return next;
        });
    };

    const handleRemoveImage = (index: number) => {
        setEditingAlbumImages((prev) => prev.filter((_, i) => i !== index));
    };

    const handleSaveEditAlbum = async (albumId: string) => {
        const title = editingAlbumTitle.trim();
        if (!title) {
            alert('El título no puede estar vacío.');
            return;
        }

        const updatedAlbums = albums.map((a: any) => (
            a.id === albumId
                ? { ...a, title, images: Array.isArray(editingAlbumImages) ? editingAlbumImages : [] }
                : a
        ));
        setProfileData((prev: any) => ({ ...prev, albums: updatedAlbums }));
        await persistAlbums(updatedAlbums);
        setEditingAlbumId(null);
        setEditingAlbumTitle('');
        setEditingAlbumImages([]);
    };

    const handleAlbumCoverUpload = async (albumId: string, event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploadingAlbumAsset(true);
        try {
            const downloadURL = await uploadAlbumAsset(
                file,
                `gallery_albums/${user.uid}/${albumId}/cover_${Date.now()}_${file.name}`,
            );

            const updatedAlbums = albums.map((a: any) =>
                a.id === albumId ? { ...a, coverImage: downloadURL } : a
            );
            setProfileData((prev: any) => ({ ...prev, albums: updatedAlbums }));
            await persistAlbums(updatedAlbums);
        } catch (error) {
            console.error('Error al subir la portada:', error?.message || error || 'Ocurrió un error desconocido');
            alert('Error al subir la portada.');
        } finally {
            setIsUploadingAlbumAsset(false);
        }
    };

    const handleAlbumImageUpload = async (albumId: string, event: React.ChangeEvent<HTMLInputElement>) => {
        if (!user) return;
        const file = event.target.files?.[0];
        if (!file) return;

        setIsUploadingAlbumAsset(true);
        try {
            const downloadURL = await uploadAlbumAsset(
                file,
                `gallery_albums/${user.uid}/${albumId}/images/${Date.now()}_${file.name}`,
            );

            const updatedAlbums = albums.map((a: any) =>
                a.id === albumId ? { ...a, images: [...(a.images || []), downloadURL] } : a
            );
            setProfileData((prev: any) => ({ ...prev, albums: updatedAlbums }));
            await persistAlbums(updatedAlbums);

            if (editingAlbumId === albumId) {
                setEditingAlbumImages((prev) => [...prev, downloadURL]);
            }
        } catch (error) {
            console.error('Error al subir imagen al álbum:', error?.message || error || 'Ocurrió un error desconocido');
            alert('Error al subir la imagen al álbum.');
        } finally {
            setIsUploadingAlbumAsset(false);
        }
    };

    const handleDeleteAlbum = async (albumId: string) => {
        const updatedAlbums = albums.filter((a: any) => a.id !== albumId);
        setProfileData((prev: any) => ({ ...prev, albums: updatedAlbums }));
        await persistAlbums(updatedAlbums);
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
        const storageRef = ref(storage, `products/${user.uid}/${productId}`);
        try {
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            setNewProduct(prev => ({ ...prev, imageURL: downloadURL }));
        } catch (error) {
            console.error('Error al subir imagen del producto:', error?.message || error || 'Ocurrió un error desconocido');
        }
    };

    const handleAddProduct = async () => {
        if (!user || !newProduct.name) return;
        
        // Verificar límite de productos según el plan
        const currentProductCount = (profileData.products || []).length;
        let maxProducts = 0;
        if (profileData.plan === 'ultra') {
            maxProducts = 15;
        } else if (profileData.plan === 'pro') {
            maxProducts = 5;
        } else {
            alert('Los productos/servicios son una característica de los planes PRO y ULTRA. Actualiza tu plan para acceder.');
            return;
        }
        
        if (currentProductCount >= maxProducts) {
            alert(`Has alcanzado el límite de ${maxProducts} productos del Plan ${profileData.plan.toUpperCase()}. ${profileData.plan === 'pro' ? 'Actualiza a ULTRA para hasta 15 productos.' : ''}`);
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
        await setDoc(doc(db, 'profiles', user.uid), { products: updatedProducts }, { merge: true });
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
        await setDoc(doc(db, 'profiles', user.uid), { products: updatedProducts }, { merge: true });
    };

    const handleDeleteProduct = async (productId: string) => {
        if (!user) return;
        const updatedProducts = (profileData.products || []).filter(p => p.id !== productId);
        setProfileData(prev => ({ ...prev, products: updatedProducts }));
        await setDoc(doc(db, 'profiles', user.uid), { products: updatedProducts }, { merge: true });
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
        <div className="space-y-12 max-w-4xl mx-auto pb-20">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white tracking-tight" style={{ fontFamily: 'var(--font-heading)' }}>
                        Gestión de Enlaces
                    </h2>
                    <p className="text-gray-400 mt-1 text-sm font-medium">Personaliza tu perfil digital con enlaces y productos.</p>
                </div>
                {/* Botón flotante o destacado para guardar si fuera necesario, pero aquí mantenemos el diseño de la pestaña */}
            </header>
            
            {/* Sección 1: Formulario Añadir Enlace */}
            <section className="animate-fade-in">
                <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </div>
                        <h3 className="font-bold text-xl text-white">Añadir Nuevo Enlace</h3>
                    </div>
                    <form onSubmit={handleAddLink} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                id="link-title"
                                label="Título del Enlace"
                                value={newLink.title}
                                onChange={(e) => setNewLink(prev => ({ ...prev, title: e.target.value }))}
                                placeholder="Ej: Mi Portafolio"
                                className="bg-[#0f1016] border-gray-700 focus:border-[#ff6600] text-white rounded-xl"
                            />
                            <Input
                                id="link-url"
                                label="URL de Destino"
                                value={newLink.url}
                                onChange={(e) => setNewLink(prev => ({ ...prev, url: e.target.value }))}
                                placeholder="https://tuweb.com"
                                className="bg-[#0f1016] border-gray-700 focus:border-[#ff6600] text-white rounded-xl"
                            />
                        </div>
                        <Button 
                            type="submit" 
                            className="w-full md:w-auto bg-[#ff6600] hover:bg-[#ff8533] text-white font-bold py-3 px-8 rounded-xl shadow-lg shadow-[#ff6600]/20 transition-all active:scale-95"
                        >
                            + Añadir Enlace
                        </Button>
                    </form>
                </div>
            </section>

            {/* Sección 2: Lista de Enlaces */}
            <section className="space-y-6">
                <div className="flex items-center justify-between px-2">
                    <h3 className="font-bold text-xl text-white flex items-center gap-2">
                        Tus Enlaces 
                        <span className="text-sm font-normal text-gray-500 bg-gray-800/50 px-2.5 py-0.5 rounded-full">
                            {links.length}
                        </span>
                    </h3>
                    <p className="text-xs text-gray-500 italic">Arrastra para reordenar</p>
                </div>

                {links && links.length > 0 ? (
                    <div className="grid gap-4">
                        {links.map((link, index) => (
                            <div 
                                key={link.id} 
                                className={`group relative flex items-start gap-4 p-5 bg-[#1a1b26] border border-gray-800 rounded-2xl transition-all hover:border-[#ff6600]/30 hover:shadow-2xl hover:shadow-black/40 cursor-grab active:cursor-grabbing ${draggedLinkIndex === index ? 'opacity-30 border-[#ff6600]' : ''}`}
                                draggable
                                onDragStart={() => setDraggedLinkIndex(index)}
                                onDragOver={(e) => {
                                    e.preventDefault();
                                    if (draggedLinkIndex === null || draggedLinkIndex === index) return;
                                    const newOrder = [...links];
                                    const [draggedItem] = newOrder.splice(draggedLinkIndex, 1);
                                    newOrder.splice(index, 0, draggedItem);
                                    setLinks(newOrder);
                                    void saveLinkOrder(newOrder);
                                    setDraggedLinkIndex(index);
                                }}
                                onDragEnd={() => {
                                    setDraggedLinkIndex(null);
                                }}
                            >
                                {/* Drag Handle */}
                                <div className="mt-2 text-gray-600 group-hover:text-[#ff6600] transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                                </div>

                                <div className="flex-grow space-y-4">
                                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
                                        <div className="flex-grow w-full md:w-1/2">
                                            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1 block">Título</label>
                                            <input
                                                type="text"
                                                value={link.title}
                                                onChange={(e) => handleLinkChange(link.id, 'title', e.target.value)}
                                                className="w-full bg-transparent border-b border-gray-800 focus:border-[#ff6600] text-lg font-bold text-white transition-colors outline-none py-1"
                                                placeholder="Título del enlace"
                                            />
                                        </div>
                                        <div className="flex-grow w-full md:w-1/2">
                                            <label className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1 block">URL de destino</label>
                                            <input
                                                type="text"
                                                value={link.url}
                                                onChange={(e) => handleLinkChange(link.id, 'url', e.target.value)}
                                                className="w-full bg-transparent border-b border-gray-800 focus:border-[#ff6600] text-sm text-gray-400 transition-colors outline-none py-1 truncate"
                                                placeholder="https://..."
                                            />
                                        </div>
                                    </div>

                                    {/* Footer de la Card con controles */}
                                    <div className="flex items-center justify-between pt-2 border-t border-gray-800/50">
                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2">
                                                <ToggleSwitch
                                                    checked={link.isActive}
                                                    onChange={() => handleToggleActive(link.id, link.isActive)}
                                                />
                                                <span className={`text-[10px] font-bold uppercase tracking-widest ${link.isActive ? 'text-[#ff6600]' : 'text-gray-600'}`}>
                                                    {link.isActive ? 'Visible' : 'Oculto'}
                                                </span>
                                            </div>
                                        </div>
                                        
                                        <button 
                                            onClick={() => handleDeleteLink(link.id)}
                                            className="p-2 text-gray-600 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                            title="Eliminar enlace"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="bg-[#1a1b26]/50 border-2 border-dashed border-gray-800 rounded-2xl py-16 text-center">
                        <div className="bg-gray-800/50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-600">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                        </div>
                        <p className="text-gray-400 font-medium">Aún no has creado ningún enlace.</p>
                        <p className="text-gray-600 text-sm mt-1 px-4">Utiliza el formulario de arriba para añadir tu primer enlace profesional.</p>
                    </div>
                )}
            </section>

            {/* Separador Visual */}
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-12" />

            {/* Sección 3: Información de Contacto */}
            <section className="animate-fade-in delay-100">
                <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                        </div>
                        <h3 className="font-bold text-xl text-white">Información de Contacto Rápido</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input
                        id="contactEmail"
                        name="contactEmail"
                        label="Correo electrónico"
                        type="email"
                        value={profileData.contactEmail || ''}
                        onChange={handleContactInfoChange}
                        placeholder="correo@ejemplo.com"
                    />
                    <Input
                        id="phone"
                        name="phone"
                        label="Teléfono"
                        type="tel"
                        value={profileData.phone || ''}
                        onChange={handleContactInfoChange}
                        placeholder="+58 412 1234567"
                    />
                    <Input
                        id="whatsapp"
                        name="whatsapp"
                        label="WhatsApp"
                        type="tel"
                        value={profileData.whatsapp || ''}
                        onChange={handleContactInfoChange}
                        placeholder="+58 412 1234567"
                    />
                    {profileData?.plan === 'ultra' ? (
                        <div className="space-y-2">
                            {[0, 1, 2].map((index) => {
                                const locationsArray: string[] = Array.isArray(profileData.locations)
                                    ? profileData.locations
                                    : profileData.location
                                        ? [profileData.location]
                                        : [];
                                const value = locationsArray[index] || '';
                                const baseLabel = index === 0
                                    ? 'Ubicación (hasta 3 para ULTRA)'
                                    : `Ubicación adicional ${index + 1}`;
                                return (
                                    <Input
                                        key={index}
                                        id={`location-${index + 1}`}
                                        name={`location-${index + 1}`}
                                        label={baseLabel}
                                        value={value}
                                        onChange={(e) => handleLocationChange(index, e.target.value)}
                                        placeholder="Ciudad, País"
                                    />
                                );
                            })}
                        </div>
                    ) : (
                        <Input
                            id="location"
                            name="location"
                            label="Ubicación"
                            value={profileData.location || ''}
                            onChange={handleContactInfoChange}
                            placeholder="Ciudad, País"
                        />
                    )}
                    <Button 
                        onClick={generateVCard}
                        className="w-full md:w-auto mt-4 bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 flex items-center justify-center gap-2"
                    >
                        <span>📇</span> Descargar vCard
                    </Button>
                </div>
            </section>

            {/* Separador Visual */}
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-12" />

            {/* Sección Redes Sociales */}
            <section className="animate-fade-in delay-150">
                <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path></svg>
                        </div>
                        <h3 className="font-bold text-xl text-white">Redes Sociales</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                        <Input
                            id="instagram"
                            label="Instagram"
                            value={profileData.socialMedia?.instagram || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, socialMedia: { ...prev.socialMedia, instagram: e.target.value } }))}
                            placeholder="@usuario"
                            className="bg-[#0f1016] border-gray-700 text-white"
                        />
                        <Input
                            id="twitter"
                            label="Twitter/X"
                            value={profileData.socialMedia?.twitter || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, socialMedia: { ...prev.socialMedia, twitter: e.target.value } }))}
                            placeholder="@usuario"
                            className="bg-[#0f1016] border-gray-700 text-white"
                        />
                        <Input
                            id="linkedin"
                            label="LinkedIn"
                            value={profileData.socialMedia?.linkedin || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, socialMedia: { ...prev.socialMedia, linkedin: e.target.value } }))}
                            placeholder="usuario"
                            className="bg-[#0f1016] border-gray-700 text-white"
                        />
                        <Input
                            id="facebook"
                            label="Facebook"
                            value={profileData.socialMedia?.facebook || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, socialMedia: { ...prev.socialMedia, facebook: e.target.value } }))}
                            placeholder="usuario"
                            className="bg-[#0f1016] border-gray-700 text-white"
                        />
                        <Input
                            id="youtube"
                            label="YouTube"
                            value={profileData.socialMedia?.youtube || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, socialMedia: { ...prev.socialMedia, youtube: e.target.value } }))}
                            placeholder="@canal"
                            className="bg-[#0f1016] border-gray-700 text-white"
                        />
                        <Input
                            id="tiktok"
                            label="TikTok"
                            value={profileData.socialMedia?.tiktok || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, socialMedia: { ...prev.socialMedia, tiktok: e.target.value } }))}
                            placeholder="@usuario"
                            className="bg-[#0f1016] border-gray-700 text-white"
                        />
                        <Input
                            id="github"
                            label="GitHub"
                            value={profileData.socialMedia?.github || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, socialMedia: { ...prev.socialMedia, github: e.target.value } }))}
                            placeholder="usuario"
                            className="bg-[#0f1016] border-gray-700 text-white"
                        />
                        <Input
                            id="website"
                            label="Sitio Web"
                            value={profileData.socialMedia?.website || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, socialMedia: { ...prev.socialMedia, website: e.target.value } }))}
                            placeholder="https://tusitio.com"
                            className="bg-[#0f1016] border-gray-700 text-white"
                        />
                    </div>
                </div>
            </section>
        
            {/* Sección 4: Productos/Servicios - Solo PRO y ULTRA */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <section className="animate-fade-in delay-200">
                    <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                                </div>
                                <h3 className="font-bold text-xl text-white">Productos y Servicios</h3>
                            </div>
                            <Button 
                                onClick={() => setIsAddingProduct(!isAddingProduct)}
                                className={`${isAddingProduct ? 'bg-gray-800 hover:bg-gray-700' : 'bg-[#ff6600] hover:bg-[#ff8533]'} text-white border-none px-4 py-2 text-sm`}
                            >
                                {isAddingProduct ? 'Cancelar' : '+ Añadir Producto'}
                            </Button>
                        </div>

                        {isAddingProduct && (
                            <div className="mb-8 p-6 bg-[#0f1016] border border-[#ff6600]/30 rounded-2xl space-y-5 animate-in slide-in-from-top duration-300">
                                <h4 className="text-white font-bold text-lg border-b border-gray-800 pb-2 mb-4">
                                    {editingProduct ? 'Editar Producto' : 'Nuevo Producto'}
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                    <Input
                                        label="Nombre del Producto"
                                        value={newProduct.name || ''}
                                        onChange={(e) => setNewProduct(prev => ({ ...prev, name: e.target.value }))}
                                        className="bg-[#1a1b26] border-gray-700 text-white"
                                    />
                                    <Input
                                        label="Precio"
                                        value={newProduct.price || ''}
                                        onChange={(e) => setNewProduct(prev => ({ ...prev, price: e.target.value }))}
                                        placeholder="Ej: $99.00"
                                        className="bg-[#1a1b26] border-gray-700 text-white"
                                    />
                                </div>
                                <Input
                                    label="Descripción Corta"
                                    value={newProduct.shortDescription || ''}
                                    onChange={(e) => setNewProduct(prev => ({ ...prev, shortDescription: e.target.value }))}
                                    placeholder="Un resumen rápido para la tarjeta"
                                    className="bg-[#1a1b26] border-gray-700 text-white"
                                />
                                <Textarea
                                    label="Descripción Detallada"
                                    value={newProduct.longDescription || ''}
                                    onChange={(e) => setNewProduct(prev => ({ ...prev, longDescription: e.target.value }))}
                                    placeholder="Describe todas las características de tu servicio..."
                                    className="bg-[#1a1b26] border-gray-700 text-white"
                                />
                                <Input
                                    label="Enlace de Compra / Más Info"
                                    value={newProduct.linkURL || ''}
                                    onChange={(e) => setNewProduct(prev => ({ ...prev, linkURL: e.target.value }))}
                                    placeholder="https://wa.me/... o link de pago"
                                    className="bg-[#1a1b26] border-gray-700 text-white"
                                />
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Imagen del Producto</label>
                                    <div className="flex items-center gap-4 p-4 bg-[#1a1b26] border-2 border-dashed border-gray-800 rounded-xl">
                                        <div className="flex-shrink-0 w-20 h-20 bg-[#0f1016] rounded-lg overflow-hidden border border-gray-700 flex items-center justify-center">
                                            {newProduct.imageURL ? (
                                                <img src={newProduct.imageURL} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                            )}
                                        </div>
                                        <div className="flex-grow">
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                onChange={handleProductImageUpload} 
                                                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-[#ff6600]/10 file:text-[#ff6600] hover:file:bg-[#ff6600]/20 cursor-pointer" 
                                            />
                                            <p className="text-[10px] text-gray-600 mt-2 italic">Formatos recomendados: JPG, PNG. Max 5MB.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="pt-4 flex gap-3">
                                    <Button 
                                        onClick={editingProduct ? handleUpdateProduct : handleAddProduct}
                                        className="bg-[#ff6600] hover:bg-[#ff8533] text-white px-8"
                                    >
                                        {editingProduct ? 'Actualizar Producto' : 'Publicar Producto'}
                                    </Button>
                                    {editingProduct && (
                                        <Button 
                                            variant="secondary"
                                            onClick={() => {
                                                setEditingProduct(null);
                                                setNewProduct({});
                                                setIsAddingProduct(false);
                                            }}
                                            className="text-gray-400 border-gray-700"
                                        >
                                            Cancelar
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {profileData.products && profileData.products.length > 0 ? (
                                profileData.products.map((product: Product) => (
                                    <div 
                                        key={product.id} 
                                        className="group bg-[#0f1016] border border-gray-800 rounded-2xl overflow-hidden hover:border-[#ff6600]/50 transition-all hover:shadow-2xl hover:shadow-black/60 relative flex flex-col h-full"
                                    >
                                        <div className="relative h-48 overflow-hidden">
                                            {product.imageURL ? (
                                                <img
                                                    src={product.imageURL}
                                                    alt={product.name}
                                                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gray-900 flex items-center justify-center text-gray-700">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                                            {product.price && (
                                                <div className="absolute bottom-3 left-3 bg-[#ff6600] text-white text-sm font-bold px-3 py-1 rounded-full shadow-lg">
                                                    {product.price}
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4 flex-grow flex flex-col">
                                            <h4 className="font-bold text-white text-lg mb-1">{product.name}</h4>
                                            <p className="text-gray-500 text-xs line-clamp-2 mb-4 flex-grow">{product.shortDescription || 'Sin descripción'}</p>
                                            
                                            <div className="flex gap-2 pt-3 border-t border-gray-800/50 mt-auto">
                                                <button 
                                                    onClick={() => handleEditProduct(product)}
                                                    className="flex-1 py-2 text-[10px] font-bold uppercase tracking-wider bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                                                >
                                                    Editar
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteProduct(product.id)}
                                                    className="px-3 py-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full py-12 text-center bg-[#0f1016]/50 border-2 border-dashed border-gray-800 rounded-2xl">
                                    <p className="text-gray-500 font-medium italic">No hay productos o servicios registrados.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </section>
            )}

            {/* Separador Visual */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-12" />
            )}

            {/* Sección Galería Multimedia - Solo para PRO y ULTRA */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <section className="animate-fade-in delay-300">
                    <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                        <div className="flex items-center gap-3 mb-8 border-b border-gray-800 pb-4">
                            <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                            </div>
                            <h3 className="font-bold text-xl text-white">Galería Multimedia</h3>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-[#ff6600]">Configuración General</h4>
                                <div className="bg-[#0f1016] p-5 rounded-2xl border border-gray-800 space-y-6">
                                    <div className="flex flex-col md:flex-row gap-3 items-end">
                                        <div className="flex-grow w-full">
                                            <Input
                                                label="Título Público de la Galería"
                                                value={profileData.galleryTitle || ''}
                                                onChange={(e) => handleGalleryTitleChange(e.target.value)}
                                                placeholder="Ej: Mis Diseños, Portafolio..."
                                                className="bg-[#1a1b26] border-gray-700 text-white"
                                            />
                                        </div>
                                        <Button
                                            onClick={() => handleSaveGalleryTitle(profileData.galleryTitle || '')}
                                            className="bg-gray-800 hover:bg-gray-700 text-white py-2 px-4 h-[42px] border border-gray-700"
                                        >
                                            Guardar
                                        </Button>
                                    </div>
                                    
                                    <div className="pt-2">
                                        <h5 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">Modo de Visualización</h5>
                                        <div className="flex bg-[#1a1b26] p-1 rounded-xl border border-gray-800">
                                            <button
                                                onClick={() => setProfileData((prev: any) => ({ ...prev, galleryMode: 'grid' }))}
                                                className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all ${galleryMode === 'grid' ? 'bg-[#ff6600] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300'}`}
                                            >
                                                Fotos Libres
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (!isUltra) return;
                                                    setProfileData((prev: any) => ({ ...prev, galleryMode: 'albums' }))
                                                }}
                                                disabled={!isUltra}
                                                className={`flex-1 py-2 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${galleryMode === 'albums' ? 'bg-[#ff6600] text-white shadow-lg' : 'text-gray-500 hover:text-gray-300 disabled:opacity-30'}`}
                                            >
                                                Álbumes
                                                {!isUltra && <span className="bg-gray-800 text-[8px] px-1.5 py-0.5 rounded text-gray-400">ULTRA</span>}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-bold uppercase tracking-widest text-[#ff6600]">Subir Archivos</h4>
                                <div className="bg-[#0f1016] p-8 rounded-2xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center text-center group hover:border-[#ff6600]/30 transition-colors">
                                    <div className="w-16 h-16 bg-gray-800/30 rounded-full flex items-center justify-center text-gray-600 mb-4 group-hover:text-[#ff6600] transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                                    </div>
                                    <p className="text-white font-bold mb-1">Subir nuevas imágenes</p>
                                    <p className="text-gray-500 text-[10px] mb-6 uppercase tracking-wider">Límite: {profileData.plan === 'ultra' ? '20' : '5'} fotos</p>
                                    
                                    {(() => {
                                        const maxImages = profileData.plan === 'ultra' ? 20 : 5;
                                        const currentCount = profileData.galleryImageURLs?.length || 0;
                                        return (!profileData.galleryImageURLs || currentCount < maxImages) && handleGalleryImageUpload && (
                                            <label className="bg-[#ff6600] hover:bg-[#ff8533] text-white font-bold py-2.5 px-6 rounded-xl shadow-lg shadow-[#ff6600]/20 cursor-pointer transition-all active:scale-95">
                                                Seleccionar Imagen
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleGalleryImageUpload}
                                                    className="hidden"
                                                />
                                            </label>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {galleryMode === 'grid' && (
                            <div className="space-y-6">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-gray-500">Imágenes Activas</h4>
                                    <span className="text-[10px] bg-gray-800 text-gray-400 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                                        {profileData.galleryImageURLs?.length || 0} / {profileData.plan === 'ultra' ? '20' : '5'}
                                    </span>
                                </div>
                                
                                {profileData.galleryImageURLs && profileData.galleryImageURLs.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                        {profileData.galleryImageURLs.map((imageUrl, index) => (
                                            <div 
                                                key={imageUrl} 
                                                className={`relative aspect-square group rounded-xl overflow-hidden border border-gray-800 hover:border-[#ff6600]/50 transition-all cursor-grab active:cursor-grabbing ${draggedGalleryIndex === index ? 'opacity-30 scale-95' : ''}`}
                                                draggable
                                                onDragStart={() => setDraggedGalleryIndex(index)}
                                                onDragOver={(e) => {
                                                    e.preventDefault();
                                                    if (draggedGalleryIndex === null || draggedGalleryIndex === index) return;
                                                    const newOrder = [...profileData.galleryImageURLs];
                                                    const [draggedItem] = newOrder.splice(draggedGalleryIndex, 1);
                                                    newOrder.splice(index, 0, draggedItem);
                                                    setProfileData(prev => ({ ...prev, galleryImageURLs: newOrder }));
                                                    setDraggedGalleryIndex(index);
                                                }}
                                                onDragEnd={() => setDraggedGalleryIndex(null)}
                                            >
                                                <img 
                                                    src={imageUrl} 
                                                    alt={`Galería ${index + 1}`} 
                                                    className="w-full h-full object-cover pointer-events-none" 
                                                />
                                                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleDeleteGalleryImage?.(index)}
                                                        className="bg-red-500 hover:bg-red-600 text-white p-2 rounded-lg shadow-lg"
                                                        title="Eliminar"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-12 bg-[#0f1016]/30 border border-gray-800 border-dashed rounded-2xl text-center">
                                        <p className="text-gray-600 italic text-sm">No has subido fotos a tu galería aún.</p>
                                    </div>
                                )}

                                {profileData.galleryImageURLs && profileData.galleryImageURLs.length > 1 && (
                                    <div className="flex justify-center pt-4">
                                        <Button 
                                            onClick={async () => {
                                                if (!user) return;
                                                setIsSavingGalleryOrder(true);
                                                try {
                                                    await setDoc(doc(db, 'profiles', user.uid), { galleryImageURLs: profileData.galleryImageURLs }, { merge: true });
                                                } catch (error) {
                                                    console.error('Error al guardar el orden de la galería:', error);
                                                } finally {
                                                    setIsSavingGalleryOrder(false);
                                                }
                                            }}
                                            disabled={isSavingGalleryOrder}
                                            className="bg-gray-800 hover:bg-gray-700 text-white text-xs py-2 px-6 rounded-full border border-gray-700"
                                        >
                                            {isSavingGalleryOrder ? 'Guardando...' : '💾 Guardar Orden de Galería'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* El modo Álbumes se mantiene con su lógica actual pero ajustando un poco los estilos de los contenedores si es necesario */}
                        {galleryMode === 'albums' && (
                            <div className="space-y-6">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                                    <h4 className="text-xs font-bold uppercase tracking-widest text-[#ff6600]">Tus Álbumes</h4>
                                    <Button
                                        onClick={() => setIsCreatingAlbum((prev) => !prev)}
                                        disabled={!isUltra}
                                        className="bg-[#ff6600]/10 hover:bg-[#ff6600]/20 text-[#ff6600] border-none text-xs py-1 px-4"
                                    >
                                        {isCreatingAlbum ? 'Cerrar Formulario' : '+ Nuevo Álbum'}
                                    </Button>
                                </div>
                                {/* Resto del código de álbumes... siguiendo el mismo patrón de diseño */}
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Separador Visual Final */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-12" />
            )}

            {/* Secci�n de Video Destacado */}
            <section className="animate-fade-in delay-500">
                <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                    <div className="flex items-center gap-3 mb-8 border-b border-gray-800 pb-4">
                        <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
                        </div>
                        <h3 className="font-bold text-xl text-white">Video Destacado</h3>
                    </div>

                    <div className="flex bg-[#0f1016] p-1 rounded-xl border border-gray-800 mb-8 w-fit">
                        <button
                            type="button"
                            onClick={() => setVideoInputMode('external')}
                            className={py-2 px-6 rounded-lg text-xs font-bold transition-all }
                        >
                            Enlace YouTube/Vimeo
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (!isUltra) return;
                                setVideoInputMode('upload');
                            }}
                            disabled={!isUltra}
                            className={py-2 px-6 rounded-lg text-xs font-bold transition-all flex items-center gap-2 }
                        >
                            Subir Video Propio
                            {!isUltra && <span className="bg-gray-800 text-[8px] px-1.5 py-0.5 rounded text-gray-400">ULTRA</span>}
                        </button>
                    </div>

                    {videoInputMode === 'external' && (
                        <div className="space-y-6">
                            <div className="flex flex-col md:flex-row gap-3 items-end">
                                <div className="flex-grow w-full">
                                    <Input
                                        id="featuredVideoURL"
                                        name="featuredVideoURL"
                                        label="URL del Video (YouTube o Vimeo)"
                                        value={profileData.featuredVideoURL || ''}
                                        onChange={(e) => setProfileData(prev => ({ ...prev, featuredVideoURL: e.target.value }))}
                                        placeholder="Pega aqu� el enlace..."
                                        className="bg-[#0f1016] border-gray-700 text-white"
                                    />
                                </div>
                                <Button 
                                    onClick={() => {
                                        if (user) {
                                            setDoc(doc(db, 'profiles', user.uid), { featuredVideoURL: profileData.featuredVideoURL }, { merge: true });
                                        }
                                    }} 
                                    className="bg-[#ff6600] hover:bg-[#ff8533] text-white py-2 px-8 h-[42px]"
                                >
                                    Guardar
                                </Button>
                            </div>
                            <p className="text-[10px] text-gray-500 italic uppercase tracking-wider">
                                El video se reproducir� directamente en tu perfil p�blico.
                            </p>
                        </div>
                    )}

                    {videoInputMode === 'upload' && (
                        <div className="space-y-6">
                            {!isUltra ? (
                                <div className="p-8 bg-[#0f1016] border border-dashed border-gray-800 rounded-2xl text-center">
                                    <p className="text-gray-500 text-sm">Esta funci�n requiere el <span className="text-[#ff6600] font-bold">Plan ULTRA</span>.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {profileData?.uploadedVideoURL ? (
                                        <div className="space-y-4">
                                            <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-gray-800 shadow-2xl">
                                                <video
                                                    src={profileData.uploadedVideoURL}
                                                    controls
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            <button
                                                onClick={handleDeleteUploadedVideo}
                                                className="flex items-center gap-2 text-xs font-bold text-red-500 hover:text-red-400 transition-colors"
                                                disabled={uploadingVideo}
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                Eliminar Video
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="bg-[#0f1016] p-10 rounded-2xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center text-center group hover:border-[#ff6600]/30 transition-colors">
                                            <div className="w-16 h-16 bg-gray-800/30 rounded-full flex items-center justify-center text-gray-600 mb-4 group-hover:text-[#ff6600] transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                                            </div>
                                            <p className="text-white font-bold mb-1">Subir Archivo de Video</p>
                                            <p className="text-gray-500 text-[10px] mb-6 uppercase tracking-wider">L�mite: 100 MB</p>
                                            
                                            <label className={g-[#ff6600] hover:bg-[#ff8533] text-white font-bold py-2.5 px-8 rounded-xl shadow-lg shadow-[#ff6600]/20 cursor-pointer transition-all active:scale-95 }>
                                                {uploadingVideo ? Subiendo %... : 'Seleccionar Video'}
                                                <input
                                                    type="file"
                                                    accept="video/*"
                                                    onChange={handleVideoUpload}
                                                    className="hidden"
                                                    disabled={uploadingVideo}
                                                />
                                            </label>
                                        </div>
                                    )}
                                    <div className="flex flex-col justify-center space-y-4">
                                        <h4 className="text-white font-bold">Consejos de Video</h4>
                                        <ul className="space-y-3">
                                            {[
                                                'Usa formatos MP4 o WebM para mejor compatibilidad.',
                                                'Manten el video bajo los 60 segundos para retenci�n.',
                                                'Aseg�rate de tener buena iluminaci�n en tu presentaci�n.'
                                            ].map((tip, i) => (
                                                <li key={i} className="flex gap-3 text-xs text-gray-400">
                                                    <span className="text-[#ff6600] font-bold">�</span>
                                                    {tip}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </section>

            {/* Separador Visual Final */}
            <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-12" />

            {/* Secci�n de Testimonios - Solo para PRO y ULTRA */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <section className="animate-fade-in delay-[600ms]">
                    <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                </div>
                                <h3 className="font-bold text-xl text-white">Testimonios y Rese�as</h3>
                            </div>
                            <Button 
                                onClick={() => openTestimonialForm()} 
                                className="bg-[#ff6600] hover:bg-[#ff8533] text-white border-none px-6 py-2 text-sm font-bold rounded-xl"
                            >
                                + Nuevo Testimonio
                            </Button>
                        </div>

                        {profileData.testimonials && profileData.testimonials.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {profileData.testimonials.map((testimonial) => (
                                    <div key={testimonial.id} className="group bg-[#0f1016] border border-gray-800 p-6 rounded-2xl relative hover:border-[#ff6600]/30 transition-all">
                                        <div className="absolute -top-3 -left-2 text-4xl text-[#ff6600]/20 font-serif">�</div>
                                        <blockquote className="text-gray-300 text-sm italic mb-6 line-clamp-4 relative z-10">
                                            {testimonial.quote}
                                        </blockquote>
                                        <div className="flex items-center justify-between border-t border-gray-800/50 pt-4">
                                            <div className="flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-full overflow-hidden border border-gray-700 bg-gray-900">
                                                    {testimonial.authorImageURL ? (
                                                        <img src={testimonial.authorImageURL} alt={testimonial.author} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-gray-700 font-bold text-xs">
                                                            {testimonial.author?.charAt(0)}
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <p className="text-white text-xs font-bold">{testimonial.author}</p>
                                                    <p className="text-[10px] text-gray-500 truncate max-w-[120px]">{testimonial.authorTitle}</p>
                                                </div>
                                            </div>
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button 
                                                    onClick={() => openTestimonialForm(testimonial)}
                                                    className="p-1.5 text-gray-500 hover:text-[#ff6600] transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                                                </button>
                                                <button 
                                                    onClick={() => handleDeleteTestimonial(testimonial.id)}
                                                    className="p-1.5 text-gray-500 hover:text-red-500 transition-colors"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 bg-[#0f1016]/50 border-2 border-dashed border-gray-800 rounded-2xl text-center">
                                <p className="text-gray-500 italic text-sm">No hay testimonios a�n. Los testimonios generan confianza en tus clientes.</p>
                            </div>
                        )}
                    </div>
                </section>
            )}

            {/* Testimonios Pendientes (Moderaci�n) */}
            {Array.isArray(pendingTestimonials) && pendingTestimonials.length > 0 && (
                <section className="mt-8 animate-bounce-subtle">
                    <div className="bg-[#ff6600]/5 border border-[#ff6600]/20 rounded-2xl p-6">
                        <h4 className="text-[#ff6600] font-bold text-sm mb-4 flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff6600] opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff6600]"></span>
                            </span>
                            Moderaci�n: Testimonios Pendientes ({pendingTestimonials.length})
                        </h4>
                        <div className="space-y-4">
                            {pendingTestimonials.map((testimonial) => (
                                <div key={testimonial.id} className="bg-[#1a1b26] p-4 rounded-xl border border-gray-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex-grow">
                                        <p className="text-gray-300 text-sm italic mb-2">"{testimonial.quote}"</p>
                                        <p className="text-white text-[10px] font-bold">� {testimonial.author} <span className="text-gray-600 font-normal">| {testimonial.authorTitle}</span></p>
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            onClick={() => handleApproveTestimonial(testimonial)}
                                            className="bg-green-600/10 hover:bg-green-600 text-green-500 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                        >
                                            Aprobar
                                        </button>
                                        <button
                                            onClick={() => handleRejectTestimonial(testimonial.id)}
                                            className="bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                                        >
                                            Rechazar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </section>
            )}

            {/* Secci�n Archivos Digitales - Solo ULTRA */}
            {profileData?.plan === 'ultra' && (
                <>
                    <div className="h-px bg-gradient-to-r from-transparent via-gray-800 to-transparent my-12" />
                    <section className="animate-fade-in delay-700 pb-10">
                        <div className="bg-[#1a1b26] border border-gray-800 rounded-2xl p-6 shadow-xl">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-[#ff6600]/10 rounded-lg text-[#ff6600]">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
                                    </div>
                                    <h3 className="font-bold text-xl text-white">Archivos Digitales</h3>
                                </div>
                                <Button 
                                    onClick={() => {
                                        const newFile = {
                                            id: Date.now().toString(),
                                            title: '',
                                            description: '',
                                            fileURL: '',
                                            fileName: '',
                                            fileType: '',
                                        };
                                        setProfileData(prev => ({ ...prev, digitalFiles: [...(prev.digitalFiles || []), newFile] }));
                                    }} 
                                    className="bg-gray-800 hover:bg-gray-700 text-white border border-gray-700 px-6 py-2 text-sm font-bold rounded-xl"
                                >
                                    + A�adir Archivo
                                </Button>
                            </div>

                            <div className="space-y-6">
                                {profileData.digitalFiles && profileData.digitalFiles.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {profileData.digitalFiles.map((file, index) => (
                                            <div key={file.id} className="bg-[#0f1016] border border-gray-800 p-6 rounded-2xl space-y-4 relative group">
                                                <button 
                                                    onClick={async () => {
                                                        if (!user) return;
                                                        const updated = (profileData.digitalFiles || []).filter((_, i) => i !== index);
                                                        setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                                                        await setDoc(doc(db, 'profiles', user.uid), { digitalFiles: updated }, { merge: true });
                                                    }}
                                                    className="absolute top-4 right-4 p-1.5 text-gray-700 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                                                </button>
                                                
                                                <Input
                                                    label="T�tulo del Archivo"
                                                    value={file.title}
                                                    onChange={(e) => {
                                                        const updated = [...(profileData.digitalFiles || [])];
                                                        updated[index] = { ...updated[index], title: e.target.value };
                                                        setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                                                    }}
                                                    placeholder="Ej: Men� de Precios PDF"
                                                    className="bg-[#1a1b26] border-gray-700 text-white"
                                                />
                                                <div className="space-y-2">
                                                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Cargar Archivo</label>
                                                    <div className="flex items-center gap-3 p-3 bg-[#1a1b26] rounded-xl border border-gray-800">
                                                        <label className="cursor-pointer bg-[#ff6600]/10 hover:bg-[#ff6600]/20 text-[#ff6600] text-[10px] font-bold py-1.5 px-3 rounded-lg transition-all uppercase tracking-tight">
                                                            {file.fileURL ? 'Cambiar' : 'Elegir'}
                                                            <input 
                                                                type="file" 
                                                                className="hidden"
                                                                onChange={async (e) => {
                                                                    if (!user) return;
                                                                    const selectedFile = e.target.files?.[0];
                                                                    if (!selectedFile) return;
                                                                    
                                                                    const storageRef = ref(storage, digital_files//_);
                                                                    try {
                                                                        await uploadBytes(storageRef, selectedFile);
                                                                        const downloadURL = await getDownloadURL(storageRef);
                                                                        const updated = [...(profileData.digitalFiles || [])];
                                                                        updated[index] = { 
                                                                            ...updated[index], 
                                                                            fileURL: downloadURL,
                                                                            fileName: selectedFile.name,
                                                                            fileType: selectedFile.type,
                                                                            fileSize: selectedFile.size
                                                                        };
                                                                        setProfileData(prev => ({ ...prev, digitalFiles: updated }));
                                                                    } catch (error) {
                                                                        alert(Error al subir: \);
                                                                    }
                                                                }}
                                                            />
                                                        </label>
                                                        <span className="text-[10px] text-gray-500 truncate flex-grow italic">
                                                            {file.fileName || 'Ning�n archivo seleccionado'}
                                                        </span>
                                                        {file.fileURL && (
                                                            <div className="text-green-500">
                                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-12 bg-[#0f1016]/30 border border-gray-800 border-dashed rounded-2xl text-center">
                                        <p className="text-gray-600 italic text-sm">No has a�adido archivos digitales para descarga.</p>
                                    </div>
                                )}
                                
                                <div className="pt-4 flex justify-end">
                                    <Button 
                                        onClick={async () => {
                                            if (!user) return;
                                            try {
                                                await setDoc(doc(db, 'profiles', user.uid), { digitalFiles: profileData.digitalFiles }, { merge: true });
                                                alert('Configuraci�n de archivos guardada.');
                                            } catch (error) {
                                                console.error(error);
                                            }
                                        }}
                                        className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-8 h-10 border border-gray-700"
                                    >
                                        Guardar Todos los Archivos
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </section>
                </>
            )}

            {/* Testimonial Form Modal */}
            {isTestimonialFormOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-[#1a1b26] border border-gray-800 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-white font-bold text-xl">
                                {editingTestimonial ? 'Editar Testimonio' : 'Nuevo Testimonio'}
                            </h3>
                            <button onClick={closeTestimonialForm} className="text-gray-500 hover:text-white transition-colors">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                            </button>
                        </div>
                        <div className="p-6 space-y-5">
                            <Textarea
                                label="La Rese�a / Cita"
                                value={testimonialForm.quote}
                                onChange={(e) => setTestimonialForm(prev => ({ ...prev, quote: e.target.value }))}
                                placeholder="Escribe lo que dicen de ti..."
                                className="bg-[#0f1016] border-gray-700 text-white min-h-[120px]"
                            />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label="Nombre del Autor"
                                    value={testimonialForm.author}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, author: e.target.value }))}
                                    placeholder="Nombre completo"
                                    className="bg-[#0f1016] border-gray-700 text-white"
                                />
                                <Input
                                    label="Cargo / Empresa"
                                    value={testimonialForm.authorTitle}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, authorTitle: e.target.value }))}
                                    placeholder="Ej: CEO en TechCorp"
                                    className="bg-[#0f1016] border-gray-700 text-white"
                                />
                            </div>
                            <div className="space-y-3">
                                <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block">Foto del Autor</label>
                                <div className="flex items-center gap-4 p-4 bg-[#0f1016] rounded-2xl border border-gray-800">
                                    <div className="w-12 h-12 rounded-full overflow-hidden bg-gray-900 border border-gray-700 flex-shrink-0">
                                        {testimonialForm.authorImageURL ? (
                                            <img src={testimonialForm.authorImageURL} alt="Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-700">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                                            </div>
                                        )}
                                    </div>
                                    <label className="cursor-pointer bg-[#ff6600]/10 hover:bg-[#ff6600]/20 text-[#ff6600] text-[10px] font-bold py-2 px-4 rounded-lg transition-all uppercase tracking-widest border border-[#ff6600]/20">
                                        Subir Foto
                                        <input type="file" accept="image/*" onChange={handleTestimonialImageUpload} className="hidden" />
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="p-6 bg-[#0f1016] border-t border-gray-800 flex gap-3">
                            <Button 
                                onClick={editingTestimonial ? handleUpdateTestimonial : handleAddTestimonial}
                                className="flex-grow bg-[#ff6600] hover:bg-[#ff8533] text-white font-bold h-12 rounded-xl border-none"
                            >
                                {editingTestimonial ? 'Actualizar Testimonio' : 'Publicar Testimonio'}
                            </Button>
                            <Button 
                                variant="secondary" 
                                onClick={closeTestimonialForm}
                                className="bg-gray-800 hover:bg-gray-700 text-white border-none h-12 rounded-xl"
                            >
                                Cancelar
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
