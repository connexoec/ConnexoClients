import React, { useState } from 'react';
import { Card, Button, Input } from '../ui';
import { supabase } from '../../src/lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';

/**
 * Pestaña Galería y Álbumes.
 *
 * Vivía dentro de LinksTab; se extrajo a su propia pestaña sin cambiar la
 * lógica ni el formato de los datos (profiles.galleryImageURLs, albums,
 * galleryTitle, galleryMode). Modo "grid" (fotos sueltas) en PRO+ y modo
 * "álbumes" reservado a ULTRA.
 */
interface GalleryTabProps {
    user: any;
    profileData: any;
    setProfileData: React.Dispatch<React.SetStateAction<any>>;
    handleGalleryImageUpload?: (event: React.ChangeEvent<HTMLInputElement>) => void;
    handleDeleteGalleryImage?: (index: number) => void;
}

export const GalleryTab: React.FC<GalleryTabProps> = ({
    user,
    profileData,
    setProfileData,
    handleGalleryImageUpload,
    handleDeleteGalleryImage,
}) => {
    const { t } = useLanguage();

    const [draggedGalleryIndex, setDraggedGalleryIndex] = useState<number | null>(null);
    const [isSavingGalleryOrder, setIsSavingGalleryOrder] = useState(false);
    const [isCreatingAlbum, setIsCreatingAlbum] = useState(false);
    const [newAlbumTitle, setNewAlbumTitle] = useState('');
    const [newAlbumCoverUrl, setNewAlbumCoverUrl] = useState('');
    const [isUploadingNewAlbumCover, setIsUploadingNewAlbumCover] = useState(false);
    const [editingAlbumId, setEditingAlbumId] = useState<string | null>(null);
    const [editingAlbumTitle, setEditingAlbumTitle] = useState('');
    const [editingAlbumImages, setEditingAlbumImages] = useState<string[]>([]);
    const [isUploadingAlbumAsset, setIsUploadingAlbumAsset] = useState(false);

    const isUltra = profileData?.plan === 'ultra';
    const galleryMode = isUltra && profileData?.galleryMode === 'albums' ? 'albums' : 'grid';
    const albums = Array.isArray(profileData?.albums) ? profileData.albums : [];

    // Si el perfil deja de ser ULTRA, el modo álbumes ya no aplica.
    React.useEffect(() => {
        if (!isUltra && profileData?.galleryMode && profileData.galleryMode !== 'grid') {
            setProfileData((prev: any) => ({ ...prev, galleryMode: 'grid' }));
        }
    }, [isUltra, profileData?.galleryMode, setProfileData]);

    const handleGalleryTitleChange = (value: string) => {
        setProfileData(prev => ({ ...prev, galleryTitle: value }));
    };

    const handleSaveGalleryTitle = async (title: string) => {
        if (!user) return;
        try {
            await supabase.from('profiles').update({ galleryTitle: title }).eq('id', user.id);
        } catch (error) {
            console.error('Error al guardar el tÃ­tulo de la galerÃ­a:', error?.message || error || 'OcurriÃ³ un error desconocido');
        }
    };

    const uploadAlbumAsset = async (file: File, storagePath: string) => {
        const { data, error } = await supabase.storage.from('assets').upload(storagePath, file);
        if (error) throw error;
        const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(storagePath);
        return publicUrl;
    };

    const persistAlbums = async (updatedAlbums: any[]) => {
        if (!user) return;
        // Supabase NO lanza excepción: devuelve { error }. Hay que revisarlo o el
        // guardado falla en silencio (ej. si falta la columna 'albums' en la BD).
        const { error } = await supabase.from('profiles').update({ albums: updatedAlbums }).eq('id', user.id);
        if (error) {
            console.error('Error al guardar álbumes:', error.message);
            alert(`No se pudieron guardar los álbumes: ${error.message}.\n\nSi dice que falta la columna, ejecuta add_missing_columns.sql en Supabase.`);
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
                `gallery_albums/${user.id}/new_album_cover_${Date.now()}_${file.name}`,
            );
            setNewAlbumCoverUrl(downloadURL);
        } catch (error) {
            console.error('Error al subir portada del Ã¡lbum:', error?.message || error || 'OcurriÃ³ un error desconocido');
            alert(t('album_cover_upload_error'));
        } finally {
            setIsUploadingNewAlbumCover(false);
        }
    };

    const handleCreateAlbum = async () => {
        if (!user) return;
        const title = newAlbumTitle.trim();
        if (!title) {
            alert(t('album_title_required'));
            return;
        }
        if (!newAlbumCoverUrl) {
            alert(t('album_cover_required'));
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
            alert(t('album_title_empty'));
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
                `gallery_albums/${user.id}/${albumId}/cover_${Date.now()}_${file.name}`,
            );

            const updatedAlbums = albums.map((a: any) =>
                a.id === albumId ? { ...a, coverImage: downloadURL } : a
            );
            setProfileData((prev: any) => ({ ...prev, albums: updatedAlbums }));
            await persistAlbums(updatedAlbums);
        } catch (error) {
            console.error('Error al subir la portada:', error?.message || error || 'OcurriÃ³ un error desconocido');
            alert(t('album_cover_update_error'));
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
                `gallery_albums/${user.id}/${albumId}/images/${Date.now()}_${file.name}`,
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
            console.error('Error al subir imagen al Ã¡lbum:', error?.message || error || 'OcurriÃ³ un error desconocido');
            alert(t('album_image_upload_error'));
        } finally {
            setIsUploadingAlbumAsset(false);
        }
    };

    const handleDeleteAlbum = async (albumId: string) => {
        const updatedAlbums = albums.filter((a: any) => a.id !== albumId);
        setProfileData((prev: any) => ({ ...prev, albums: updatedAlbums }));
        await persistAlbums(updatedAlbums);
    };

    if (!profileData) return <div>{t('account_loading')}</div>;

    if (!(profileData?.plan === 'pro' || profileData?.plan === 'ultra')) {
        return (
            <div className="max-w-4xl mx-auto px-5 md:px-0 pb-32 animate-fade-in-up">
                <Card className="text-center py-14">
                    <p className="text-[var(--text-muted)] font-bold">
                        {t('gallery_upgrade_prompt')}
                    </p>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto px-5 md:px-0 pb-32 animate-fade-in-up">
            <div className="mb-6 md:mb-8 text-center md:text-left">
                <h2 className="text-2xl font-bold font-sans text-[#ffefe5]">{t('gallery_title')}</h2>
                <p className="text-sm font-sans text-[#ffefe5]/70 mt-1 md:mt-2">{t('gallery_tab_desc')}</p>
            </div>
            {/* Sección Galería Multimedia - Solo para PRO y ULTRA */}
            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra') && (
                <section className="animate-fade-in-up" style={{ animationDelay: '0.5s' }}>
                    <Card>
                        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-5">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-[#ff6600] text-white rounded-xl shadow-lg shadow-[#ff6600]/20 flex items-center justify-center min-h-[36px] w-[36px]">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                </div>
                                <h3 className="font-bold text-lg font-sans text-[#ffefe5] w-full">{t('gallery_title')}</h3>
                            </div>
                            
                            <div className="flex bg-[#000000]/20 p-1 rounded-2xl border border-[#962700]/30 w-full md:w-auto overflow-hidden">
                                <button
                                    onClick={() => setProfileData((prev: any) => ({ ...prev, galleryMode: 'grid' }))}
                                    className={`flex-1 md:flex-none py-2 px-4 rounded-xl text-xs font-bold uppercase italic tracking-widest transition-all duration-300 min-h-[36px] ${galleryMode === 'grid' ? 'bg-[#ff6600] text-white shadow-lg' : 'text-[#ffefe5]/60 hover:text-white'}`}
                                >
                                    {t('free_photos')}
                                </button>
                                <button
                                    onClick={() => {
                                        if (!isUltra) return;
                                        setProfileData((prev: any) => ({ ...prev, galleryMode: 'albums' }))
                                    }}
                                    disabled={!isUltra}
                                    className={`flex-1 md:flex-none py-2 px-4 rounded-xl text-xs font-bold uppercase italic tracking-widest transition-all duration-300 flex items-center justify-center gap-2 min-h-[36px] ${galleryMode === 'albums' ? 'bg-[#ff6600] text-white shadow-lg' : 'text-[#ffefe5]/60 hover:text-white disabled:opacity-30'}`}
                                >
                                    {t('albums')}
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            <div className="space-y-4">
                                <h4 className="text-xs font-black uppercase tracking-widest text-[var(--primary-orange)] font-tomorrow italic">{t('gallery_config_title')}</h4>
                                <Card className="p-4 bg-black/10 border border-[#962700]/20">
                                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                                        <div className="flex-grow w-full">
                                            <Input
                                                label={t('gallery_public_title')}
                                                value={profileData.galleryTitle || ''}
                                                onChange={(e) => handleGalleryTitleChange(e.target.value)}
                                                placeholder={t('gallery_title_placeholder')}
                                            />
                                        </div>
                                        <Button
                                            onClick={() => handleSaveGalleryTitle(profileData.galleryTitle || '')}
                                            className="whitespace-nowrap"
                                        >
                                            {t('save')}
                                        </Button>
                                    </div>
                                </Card>
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-black uppercase tracking-widest text-[var(--primary-orange)] font-tomorrow italic">{t('upload_images_title')}</h4>
                                <div className="bg-black/10 p-6 rounded-2xl border-2 border-dashed border-[#962700]/20 flex flex-col items-center justify-center text-center group hover:border-[#ff6600]/40 transition-all duration-500">
                                    <div className="w-12 h-12 bg-[#ffefe5]/5 rounded-2xl flex items-center justify-center text-[#ff6600]/40 mb-4 group-hover:text-[#ff6600] group-hover:scale-110 transition-all duration-500">
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                                    </div>
                                    <p className="text-white font-bold uppercase italic font-tomorrow tracking-wider transform group-hover:scale-105 transition-transform">{t('upload_new_images')}</p>
                                    <p className="text-[#ffefe5]/50 text-[10px] my-3 uppercase tracking-tighter font-bold">{t('upload_limit', { max: profileData.plan === 'ultra' ? '20' : '5' })}</p>
                                    
                                    {(() => {
                                        const maxImages = profileData.plan === 'ultra' ? 20 : 5;
                                        const currentCount = profileData.galleryImageURLs?.length || 0;
                                        return (!profileData.galleryImageURLs || currentCount < maxImages) && handleGalleryImageUpload && (
                                            <div className="mt-4">
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    onChange={handleGalleryImageUpload}
                                                    className="hidden"
                                                    id="gallery-upload"
                                                />
                                                <label 
                                                    htmlFor="gallery-upload"
                                                    className="inline-flex items-center justify-center px-10 py-3 bg-[#ff6600] hover:bg-[#ffa35d] text-white font-bold uppercase italic tracking-widest rounded-xl shadow-xl shadow-[#ff6600]/20 cursor-pointer transition-all active:scale-[0.98] min-h-[48px]"
                                                >
                                                    {t('upload_select_image')}
                                                </label>
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>

                        {galleryMode === 'grid' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                <div className="flex items-center justify-between border-b border-[var(--dark-orange)]/20 pb-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] font-tomorrow italic">Imágenes Activas</h4>
                                    <span className="text-sm text-white/40 font-medium">{profileData.galleryImageURLs?.length || 0} / {profileData.plan === 'ultra' ? '20' : '5'}</span>
                                </div>
                                
                                {profileData.galleryImageURLs && profileData.galleryImageURLs.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                                        {profileData.galleryImageURLs.map((imageUrl, index) => (
                                            <div 
                                                key={imageUrl} 
                                                className={`relative aspect-square group rounded-2xl overflow-hidden border-2 border-[var(--dark-orange)]/20 hover:border-[var(--primary-orange)]/50 transition-all duration-500 cursor-grab active:cursor-grabbing shadow-lg hover:shadow-[var(--primary-orange)]/10 ${draggedGalleryIndex === index ? 'opacity-30 scale-95 border-[var(--primary-orange)]' : ''}`}
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
                                                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-115 pointer-events-none" 
                                                />
                                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center p-4">
                                                    <div className="flex gap-2 transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                                        <button
                                                            onClick={() => handleDeleteGalleryImage?.(index)}
                                                            className="bg-red-500/90 hover:bg-red-600 text-white p-3 rounded-2xl shadow-2xl backdrop-blur-md transition-all active:scale-90"
                                                            title="Eliminar"
                                                        >
                                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-20 bg-[var(--background-dark)]/20 border-2 border-[var(--dark-orange)]/10 border-dashed rounded-3xl text-center">
                                        <p className="text-[var(--text-muted)] italic font-bold tracking-tight">No has subido fotos a tu galería aún.</p>
                                    </div>
                                )}

                                {profileData.galleryImageURLs && profileData.galleryImageURLs.length > 1 && (
                                    <div className="flex justify-center pt-8">
                                        <Button 
                                            onClick={async () => {
                                                if (!user) return;
                                                setIsSavingGalleryOrder(true);
                                                try {
                                                    await supabase.from('profiles').update({ galleryImageURLs: profileData.galleryImageURLs }).eq('id', user.id);
                                                } catch (error) {
                                                    console.error('Error al guardar el orden de la galería:', error);
                                                } finally {
                                                    setIsSavingGalleryOrder(false);
                                                }
                                            }}
                                            loading={isSavingGalleryOrder}
                                            className="w-full rounded-full text-xs font-black uppercase tracking-widest italic"
                                        >
                                            {isSavingGalleryOrder ? 'Guardando...' : '💾 Guardar Orden'}
                                        </Button>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {galleryMode === 'albums' && (
                            <div className="space-y-8 animate-in fade-in duration-500">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[var(--dark-orange)]/20 pb-4">
                                    <h4 className="text-xs font-black uppercase tracking-widest text-[var(--primary-orange)] font-tomorrow italic">Tus Álbumes</h4>
                                    <Button
                                        onClick={() => setIsCreatingAlbum((prev) => !prev)}
                                        disabled={!isUltra}
                                        variant={isCreatingAlbum ? "secondary" : "primary"}
                                        className="rounded-xl px-6 font-bold"
                                    >
                                        <svg className={`w-4 h-4 mr-2 transition-transform duration-300 ${isCreatingAlbum ? 'rotate-45' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                                        {isCreatingAlbum ? 'Cancelar' : 'Nuevo Álbum'}
                                    </Button>
                                </div>
                                
                                {isCreatingAlbum && (
                                    <Card className="!p-8 border-2 border-[var(--primary-orange)]/30 bg-[var(--background-dark)]/60 animate-in slide-in-from-top duration-500 shadow-2xl">
                                        <div className="space-y-8">
                                            <Input
                                                label="Título del Álbum"
                                                value={newAlbumTitle}
                                                onChange={(e) => setNewAlbumTitle(e.target.value)}
                                                placeholder="Ej: Vacaciones 2024"
                                                className="!bg-[var(--background-dark)] border-[var(--dark-orange)]/30 text-white font-bold"
                                            />
                                            <div className="space-y-4">
                                                <label className="text-xs font-black uppercase tracking-widest text-[var(--text-muted)] font-tomorrow italic">Portada del Álbum</label>
                                                <div className="flex flex-col sm:flex-row items-center gap-8 p-6 bg-[var(--background-dark)]/40 border-2 border-dashed border-[var(--dark-orange)]/20 rounded-3xl transition-all hover:border-[var(--primary-orange)]/40 group">
                                                    <div className="relative w-32 h-32 bg-[var(--background-dark)] rounded-2xl overflow-hidden border-2 border-[var(--dark-orange)]/20 shadow-inner group-hover:border-[var(--primary-orange)]/30 transition-all">
                                                        {newAlbumCoverUrl ? (
                                                            <img src={newAlbumCoverUrl} alt="Cover" className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex flex-col items-center justify-center text-[var(--text-muted)] group-hover:text-[var(--primary-orange)]/60">
                                                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>
                                                                <span className="text-[10px] mt-2 font-black uppercase italic tracking-tighter">Portada</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="flex-1 w-full sm:w-auto">
                                                        <input type="file" accept="image/*" className="hidden" id="album-cover-upload" onChange={handleNewAlbumCoverUpload} />
                                                        <label 
                                                            htmlFor="album-cover-upload"
                                                            className="inline-flex items-center justify-center w-full px-8 py-4 bg-[var(--background-elevated)] text-white font-black uppercase italic tracking-widest rounded-2xl border border-[var(--dark-orange)]/30 hover:bg-[var(--background-card)] hover:border-[var(--primary-orange)] cursor-pointer transition-all active:scale-[0.98]"
                                                        >
                                                            {isUploadingNewAlbumCover ? 'Subiendo...' : 'Seleccionar Imagen'}
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-4 pt-4">
                                                <Button onClick={handleCreateAlbum} className="flex-1 rounded-xl py-4 font-black uppercase tracking-widest italic text-lg shadow-xl shadow-[var(--primary-orange)]/20">Crear Álbum</Button>
                                                <Button onClick={() => setIsCreatingAlbum(false)} variant="secondary" className="px-10 rounded-xl">Cancelar</Button>
                                            </div>
                                        </div>
                                    </Card>
                                )}
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                                    {albums.map((album: any) => (
                                        <Card 
                                            key={album.id} 
                                            className="group relative !p-0 overflow-hidden border-2 border-[var(--dark-orange)]/20 hover:border-[var(--primary-orange)]/40 transition-all duration-500 hover:shadow-2xl hover:shadow-[var(--primary-orange)]/5 flex flex-col bg-[#1a0a03]/60"
                                        >
                                            {editingAlbumId === album.id ? (
                                                <div className="p-6 space-y-6">
                                                    <Input
                                                        label="Título"
                                                        value={editingAlbumTitle}
                                                        onChange={(e) => setEditingAlbumTitle(e.target.value)}
                                                        className="!bg-[var(--background-dark)] border-[var(--dark-orange)]/30 text-white font-bold"
                                                    />
                                                    <div className="flex gap-3">
                                                        <Button onClick={() => handleSaveEditAlbum(album.id)} className="flex-1 py-1 text-xs">Guardar</Button>
                                                        <Button onClick={() => setEditingAlbumId(null)} variant="secondary" className="px-4 py-1 text-xs">Cancelar</Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="relative aspect-[4/5] overflow-hidden">
                                                        <img src={album.coverImage} alt={album.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-115" />
                                                        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/20 to-transparent" />
                                                        <div className="absolute bottom-0 left-0 right-0 p-6 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-500">
                                                            <h5 className="text-white font-black text-xl italic uppercase font-tomorrow tracking-tight mb-1">{album.title}</h5>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-sm text-white/70 font-medium">{album.images?.length || 0} fotos</span>
                                                            </div>
                                                        </div>
                                                        <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transform translate-x-4 group-hover:translate-x-0 transition-all duration-300">
                                                            <button 
                                                                onClick={() => handleStartEditAlbum(album)} 
                                                                className="p-2.5 bg-black/60 hover:bg-[var(--primary-orange)] rounded-xl text-white backdrop-blur-md shadow-2xl transition-all active:scale-90"
                                                            >
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleDeleteAlbum(album.id)} 
                                                                className="p-2.5 bg-black/60 hover:bg-red-500 rounded-xl text-white backdrop-blur-md shadow-2xl transition-all active:scale-90"
                                                            >
                                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="p-4 border-t border-[var(--dark-orange)]/10">
                                                        <input type="file" accept="image/*" className="hidden" id={`album-upload-${album.id}`} onChange={(e) => handleAlbumImageUpload(album.id, e)} />
                                                        <label 
                                                            htmlFor={`album-upload-${album.id}`}
                                                            className="flex items-center justify-center w-full py-4 bg-[var(--background-elevated)] hover:bg-[var(--background-card)] text-white font-black uppercase italic tracking-widest text-xs rounded-xl border border-[var(--dark-orange)]/20 transition-all cursor-pointer active:scale-[0.98]"
                                                        >
                                                            <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
                                                            {t('upload_select_image')}
                                                        </label>
                                                    </div>
                                                </>
                                            )}
                                        </Card>
                                    ))}
                                </div>
                                
                                {albums.length === 0 && !isCreatingAlbum && (
                                    <div className="text-center py-20 bg-[var(--background-dark)]/20 border-2 border-[var(--dark-orange)]/10 border-dashed rounded-3xl">
                                        <p className="text-[var(--text-muted)] font-black uppercase italic font-tomorrow tracking-tight mb-2">No tienes álbumes creados aún.</p>
                                        <p className="text-[var(--text-muted)] text-[10px] uppercase font-bold tracking-widest">Crea tu primer álbum para organizar tus fotos.</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </section>
            )}


        </div>
    );
};

export default GalleryTab;
