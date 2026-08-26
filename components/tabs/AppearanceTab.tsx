import React, { useState, useMemo, useCallback } from 'react';
import { ToggleSwitch, Input, Card, Button, Badge, Textarea } from '../ui';
import { MobilePreview } from '../MobilePreview';
import { supabase } from '../../src/lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';
import { useTheme } from '../../contexts/ThemeContext';
import { Palette, User as UserIconLucide, Image as ImageIconLucide, Paintbrush, Clock, Sparkles, Upload, RotateCcw } from 'lucide-react';
import { supportsStyle, defaultStyleValue, resetStylesPatch, type StyleField } from '../../src/lib/themeStyleCapabilities';

// Icons
const ThemeIcon = () => <Palette className="w-5 h-5" />;
const UserIcon = () => <UserIconLucide className="w-5 h-5" />;
const ImageIcon = () => <ImageIconLucide className="w-5 h-5" />;
const PaletteIcon = () => <Paintbrush className="w-5 h-5" />;
const ClockIcon = () => <Clock className="w-5 h-5" />;
const SparklesIcon = () => <Sparkles className="w-4 h-4" />;
const UploadIcon = () => <Upload className="w-4 h-4" />;
const RotateIcon = () => <RotateCcw className="w-4 h-4" />;

const BUSINESS_DAY_KEYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

type BusinessDay = {
    day: string;
    isOpen: boolean;
    openTime: string;
    closeTime: string;
};

interface AppearanceTabProps {
    profileData: any;
    setProfileData: React.Dispatch<React.SetStateAction<any>>;
    user: any;
    // También alimenta los <select> de esta pestaña (tipografía y tema).
    handleInputChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
    generateCopy: (type: 'bio' | 'title', targetField: string, keywords?: string) => Promise<void>;
    isGenerating: boolean;
    suggestions: string[];
    suggestionTargetField: string | null;
    setSuggestions: React.Dispatch<React.SetStateAction<string[]>>;
    setSuggestionTargetField: React.Dispatch<React.SetStateAction<string | null>>;
    links?: any[];
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
    profileData,
    setProfileData,
    user,
    handleInputChange,
    generateCopy,
    isGenerating,
    suggestions,
    suggestionTargetField,
    setSuggestions,
    setSuggestionTargetField,
    links = []
}) => {
    const { t } = useLanguage();
    const { setTheme } = useTheme();

    // ── Alcance real de los estilos ──────────────────────────────────────────
    // Cada plantilla aplica un subconjunto distinto de estos controles. Se
    // muestran sólo los que su perfil público va a respetar; antes se ofrecían
    // todos a todos y la mayoría no hacía nada.
    const can = (field: StyleField) => supportsStyle(profileData?.theme, field);

    const [stylesReset, setStylesReset] = useState(false);

    const handleResetStyles = () => {
        if (!window.confirm(t('appearance_reset_confirm'))) return;
        // Se vacían los campos en vez de escribir un hex: así la plantilla
        // vuelve a su respaldo propio y el resultado es idéntico al de un
        // perfil recién creado, sin riesgo de que un valor copiado a mano se
        // desvíe del color real de la plantilla.
        setProfileData((prev: any) => ({ ...prev, ...resetStylesPatch() }));
        setStylesReset(true);
    };

    /** Selector de color; el respaldo mostrado es el de ESTA plantilla. */
    const colorField = (field: StyleField, labelKey: any, genericFallback: string) => {
        const shown = profileData?.[field] || defaultStyleValue(profileData?.theme, field) || genericFallback;
        return (
            <div className="space-y-2" key={field}>
                <label className="block text-xs font-bold text-[#ffefe5]/40 uppercase tracking-widest">{t(labelKey)}</label>
                <div className="flex items-center gap-3 p-3 bg-black/20 rounded-xl border border-[#962700]/10">
                    <input
                        type="color"
                        name={field}
                        value={shown}
                        onChange={handleInputChange}
                        className="h-10 w-10 rounded cursor-pointer border-0 bg-transparent"
                    />
                    <span className="text-[#ffefe5]/60 text-xs font-mono">{shown}</span>
                </div>
            </div>
        );
    };

    const handleDarkModeToggle = async (isChecked: boolean) => {
        if (!user) {
            console.error('handleDarkModeToggle: No user found');
            return;
        }

        // 1. Actualizar el estado local (React) PRIMERO para respuesta visual inmediata
        setProfileData(prev => ({ ...prev, darkMode: isChecked }));

        // 2. Cambiar el tema visual usando el contexto
        setTheme(isChecked ? 'dark' : 'light');

        // 3. Guardar inmediatamente en BD
        try {
            await supabase.from('profiles').update({ darkMode: isChecked }).eq('id', user.id);
        } catch (error) {
            console.error('Error saving dark mode toggle:', error?.message || error || 'Ocurrió un error desconocido');
        }
    };

    const handleScheduleToggle = async (isChecked: boolean) => {
        if (!user) {
            console.error('handleScheduleToggle: No user found');
            return;
        }

        // 1. Actualizar el estado local (React) PRIMERO para respuesta visual inmediata
        setProfileData(prev => ({ ...prev, showSchedule: isChecked }));

        try {
            const dataToSave: any = { showSchedule: isChecked };
            if (isChecked && (!profileData.businessHours || profileData.businessHours.length === 0)) {
                const defaultBusinessHours = [
                    { day: 'lunes', isOpen: true, openTime: '09:00', closeTime: '18:00' },
                    { day: 'martes', isOpen: true, openTime: '09:00', closeTime: '18:00' },
                    { day: 'miércoles', isOpen: true, openTime: '09:00', closeTime: '18:00' },
                    { day: 'jueves', isOpen: true, openTime: '09:00', closeTime: '18:00' },
                    { day: 'viernes', isOpen: true, openTime: '09:00', closeTime: '18:00' },
                    { day: 'sábado', isOpen: false, openTime: '', closeTime: '' },
                    { day: 'domingo', isOpen: false, openTime: '', closeTime: '' }
                ];
                dataToSave.businessHours = defaultBusinessHours;
            }
            await supabase.from('profiles').update(dataToSave).eq('id', user.id);
        } catch (error: any) {
            console.error('Error saving schedule toggle:', error?.message || error || 'Ocurrió un error desconocido');
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, field: 'profilePhotoURL' | 'coverImageURL' | 'logoURL') => {
        if (!user) return;
        const file = event.target.files?.[0];
        if (!file) return;

        const fileName = `${Date.now()}_${file.name}`;
        try {
            const { error } = await supabase.storage.from('assets').upload(`${field}/${user.id}/${fileName}`, file);
            if (error) throw error;

            const { data: { publicUrl } } = supabase.storage.from('assets').getPublicUrl(`${field}/${user.id}/${fileName}`);
            const updatedData = { [field]: publicUrl };

            const { error: updateError } = await supabase.from('profiles').update(updatedData).eq('id', user.id);
            if (updateError) throw updateError;

            setProfileData(prev => ({ ...prev, ...updatedData }));
        } catch (error: any) {
            console.error('Error during file upload:', error);
            alert(`Error al subir el archivo: ${error.message}`);
        }
    };

    const dayLabels: Record<string, string> = useMemo(() => ({
        lunes: t('day_monday'),
        martes: t('day_tuesday'),
        miércoles: t('day_wednesday'),
        jueves: t('day_thursday'),
        viernes: t('day_friday'),
        sábado: t('day_saturday'),
        domingo: t('day_sunday'),
    }), [t]);

    const createEmptyDay = (day: string): BusinessDay => ({
        day,
        isOpen: false,
        openTime: '',
        closeTime: ''
    });

    const handleHourChange = useCallback((dayKey: string, field: 'isOpen' | 'openTime' | 'closeTime', value: string | boolean) => {
        setProfileData(prev => {
            const prevData = (prev ?? {}) as Record<string, any>;
            const rawHours = Array.isArray(prevData.businessHours) ? prevData.businessHours : [];
            const currentHours: BusinessDay[] = rawHours
                .map((item: any): BusinessDay => ({
                    day: typeof item?.day === 'string' ? item.day : '',
                    isOpen: Boolean(item?.isOpen),
                    openTime: typeof item?.openTime === 'string' ? item.openTime : '',
                    closeTime: typeof item?.closeTime === 'string' ? item.closeTime : '',
                }))
                .filter(item => item.day);

            const hoursMap = new Map<string, BusinessDay>(currentHours.map(item => [item.day, { ...item }]));
            const existing = hoursMap.get(dayKey) || createEmptyDay(dayKey);
            let updated: BusinessDay = { ...existing };

            if (field === 'isOpen') {
                const isOpenValue = Boolean(value);
                updated.isOpen = isOpenValue;
                if (!isOpenValue) {
                    updated.openTime = '';
                    updated.closeTime = '';
                } else if (!existing.openTime && !existing.closeTime) {
                    updated.openTime = '09:00';
                    updated.closeTime = '18:00';
                }
            } else if (field === 'openTime' || field === 'closeTime') {
                updated = {
                    ...updated,
                    [field]: typeof value === 'string' ? value : ''
                } as BusinessDay;
            }

            hoursMap.set(dayKey, updated);
            const normalized = BUSINESS_DAY_KEYS.map(day => hoursMap.get(day) || createEmptyDay(day));
            return { ...prevData, businessHours: normalized };
        });
    }, [setProfileData]);

    // Guardia antes del return
    if (!profileData) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[var(--primary-orange)]"></div>
                    <p className="text-[var(--text-secondary)]">{t('appearance_loading')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in-up space-y-6 md:space-y-12 max-w-6xl mx-auto px-5 md:px-0 pb-32">
            <div className="mb-6 md:mb-8 text-center md:text-left">
                <h2 className="text-2xl font-bold font-sans text-[#ffefe5]">
                    {t('appearance_tab_header_title')}
                </h2>
                <p className="text-sm font-sans text-[#ffefe5]/70 mt-1 md:mt-2">
                    {t('appearance_tab_desc')}
                </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {/* Sección Tema y Visibilidad.
                        Sólo se dibuja si esta plantilla honra al menos uno de sus
                        controles: mostrarlos "por si acaso" era justo el problema
                        (el cliente los tocaba y no pasaba nada). */}
                    {(can('darkMode') || can('showSchedule') || can('bookingLink')) && (
                    <Card>
                        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[#962700]/20">
                            <div className="p-2 bg-[#ff6600]/10 rounded-xl text-[#ff6600]">
                                <ThemeIcon />
                            </div>
                            <h3 className="text-lg font-bold text-[#ffefe5]">{t('appearance_theme_visibility')}</h3>
                        </div>
                        <div className="space-y-4">
                            {can('darkMode') && (
                                <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-[#962700]/10">
                                    <span className="text-sm font-medium text-[#ffefe5]">{t('dark_mode')}</span>
                                    <ToggleSwitch checked={Boolean(profileData.darkMode)} onChange={handleDarkModeToggle} />
                                </div>
                            )}
                            {can('showSchedule') && (
                                <div className="flex items-center justify-between p-4 bg-black/20 rounded-xl border border-[#962700]/10">
                                    <span className="text-sm font-medium text-[#ffefe5]">{t('show_schedule')}</span>
                                    <ToggleSwitch checked={Boolean(profileData.showSchedule)} onChange={handleScheduleToggle} />
                                </div>
                            )}

                            {/* El enlace de agenda ya no depende de que los horarios
                                estén encendidos: son cosas distintas, y esa atadura
                                dejaba el campo inalcanzable en plantillas que sí lo
                                usan pero no publican horarios. */}
                            {can('bookingLink') && (
                                <div className="p-4 bg-black/20 rounded-xl border border-[#962700]/10 space-y-3">
                                    <label className="text-sm font-medium text-[#ffefe5] block">
                                        {t('booking_link_label') || 'Enlace de Reserva'}
                                    </label>
                                    <Input
                                        name="bookingLink"
                                        value={profileData.bookingLink || ''}
                                        onChange={handleInputChange}
                                        placeholder={t('booking_link_placeholder') || 'https://calendly.com/...'}
                                        className="!bg-black/40 border-[#962700]/30 text-[#ffefe5]"
                                    />
                                    <p className="text-[10px] text-[#ffefe5]/50 italic">
                                        {t('booking_link_hint') || 'Este enlace alimenta el botón "Agendar una cita" en tu perfil.'}
                                    </p>
                                </div>
                            )}
                        </div>
                    </Card>
                    )}

                    {/* Sección Perfil Básico */}
                    <Card>
                        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[#962700]/20">
                            <div className="p-2 bg-[#ff6600]/10 rounded-xl text-[#ffa35d]">
                                <UserIcon />
                            </div>
                            <h3 className="text-lg font-bold text-[#ffefe5]">{t('profile')}</h3>
                        </div>
                        <div className="space-y-4">
                            <Input
                                label={t('name_label')}
                                id="displayName"
                                name="displayName"
                                value={profileData.displayName || ''}
                                onChange={handleInputChange}
                            />
                            <Input
                                label={t('job_title_label')}
                                id="jobTitle"
                                name="jobTitle"
                                value={profileData.jobTitle || ''}
                                onChange={handleInputChange}
                            />
                            <Input
                                label={t('company_label')}
                                id="company"
                                name="company"
                                value={profileData.company || ''}
                                onChange={handleInputChange}
                            />
                            
                            <div className="space-y-2">
                                <div className="flex items-start gap-2">
                                    <div className="flex-1">
                                        <Textarea
                                            id="bio"
                                            name="bio"
                                            label={t('short_bio_label')}
                                            value={profileData.bio || ''}
                                            onChange={handleInputChange}
                                            placeholder={t('short_bio_hint')}
                                            rows={3}
                                        />
                                    </div>
                                    <Button
                                        variant="secondary"
                                        onClick={() => generateCopy('bio', 'bio', profileData?.jobTitle || profileData?.displayName || '')}
                                        disabled={isGenerating && suggestionTargetField === 'bio'}
                                        className="mt-8"
                                    >
                                        <SparklesIcon />
                                        {isGenerating && suggestionTargetField === 'bio' ? '...' : t('generate')}
                                    </Button>
                                </div>

                                {/* Sugerencias Bio */}
                                {suggestionTargetField === 'bio' && !isGenerating && suggestions.length > 0 && (
                                    <div className="mt-3 p-4 bg-black/20 rounded-xl border border-[#962700]/20">
                                        <p className="text-xs mb-3 text-[#ffefe5]/50">{t('suggestions_hint')}</p>
                                        <div className="space-y-2">
                                            {suggestions.map((s, i) => (
                                                <button
                                                    key={i}
                                                    type="button"
                                                    onClick={() => {
                                                        handleInputChange({ target: { name: 'bio', value: s } } as any);
                                                        setSuggestions([]);
                                                        setSuggestionTargetField(null);
                                                    }}
                                                    className="text-sm block text-left w-full p-4 rounded-xl transition-colors hover:bg-[#ff6600]/10 text-[#ff6600] bg-[#210900] border border-[#962700]/10 min-h-[48px]"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <Textarea
                                id="aboutMe"
                                name="aboutMe"
                                label={t('about_me_label')}
                                placeholder={t('about_me_placeholder')}
                                value={profileData.aboutMe || ''}
                                onChange={handleInputChange}
                                rows={5}
                            />
                        </div>
                    </Card>

                    {/* Sección Imágenes */}
                    <Card>
                        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[#962700]/20">
                            <div className="p-2 bg-[#ff6600]/10 rounded-xl text-[#ffa35d]">
                                <ImageIcon />
                            </div>
                            <h3 className="text-lg font-bold text-[#ffefe5]">{t('images')}</h3>
                        </div>
                        <div className="space-y-6">
                            {/* Profile Photo */}
                            <div className="space-y-3">
                                <label className="block text-sm font-bold text-[#ffefe5]/60 uppercase tracking-widest">{t('profile_photo_label')}</label>
                                <div className="flex items-center gap-6">
                                    {profileData.profilePhotoURL && (
                                        <img
                                            src={profileData.profilePhotoURL}
                                            className="w-20 h-20 rounded-full object-cover border-2 border-[#962700]/30 shadow-xl"
                                            alt="Profile"
                                        />
                                    )}
                                    <label className="cursor-pointer inline-flex items-center justify-center px-6 min-h-[48px] bg-black/20 hover:bg-[#ff6600] text-white rounded-xl transition-all border border-[#962700]/30 active:scale-95 leading-none">
                                        <UploadIcon />
                                        <span className="ml-3 text-xs font-bold uppercase tracking-widest">{t('upload_select_image')}</span>
                                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'profilePhotoURL')} className="hidden"/>
                                    </label>
                                </div>
                            </div>
                            
                            {/* Cover Image */}
                            <div className="space-y-3">
                                <label className="block text-sm font-bold text-[#ffefe5]/60 uppercase tracking-widest">{t('cover_image_label')}</label>
                                <div className="flex items-center gap-6">
                                    {profileData.coverImageURL && (
                                        <img
                                            src={profileData.coverImageURL}
                                            className="w-32 h-20 object-cover rounded-xl border border-[#962700]/30 shadow-xl"
                                            alt="Cover"
                                        />
                                    )}
                                    <label className="cursor-pointer inline-flex items-center justify-center px-6 min-h-[48px] bg-black/20 hover:bg-[#ff6600] text-white rounded-xl transition-all border border-[#962700]/30 active:scale-95 leading-none">
                                        <UploadIcon />
                                        <span className="ml-3 text-xs font-bold uppercase tracking-widest">{t('upload_select_image')}</span>
                                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'coverImageURL')} className="hidden"/>
                                    </label>
                                </div>
                            </div>
                            
                            {/* Logo */}
                            <div className="space-y-3">
                                <label className="block text-sm font-bold text-[#ffefe5]/60 uppercase tracking-widest">{t('logo_label')}</label>
                                <div className="flex items-center gap-6">
                                    {profileData.logoURL && (
                                        <img
                                            src={profileData.logoURL}
                                            className="w-20 h-20 object-contain rounded-xl border border-[#962700]/30 bg-black/20 p-3 shadow-xl"
                                            alt="Logo"
                                        />
                                    )}
                                    <label className="cursor-pointer inline-flex items-center justify-center px-6 min-h-[48px] bg-black/20 hover:bg-[#ff6600] text-white rounded-xl transition-all border border-[#962700]/30 active:scale-95 leading-none">
                                        <UploadIcon />
                                        <span className="ml-3 text-xs font-bold uppercase tracking-widest">{t('upload_select_image')}</span>
                                        <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'logoURL')} className="hidden"/>
                                    </label>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Sección Estilos */}
                    <Card>
                        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[#962700]/20">
                            <div className="p-2 bg-[#ff6600]/10 rounded-xl text-[#ffa35d]">
                                <PaletteIcon />
                            </div>
                            <h3 className="text-lg font-bold text-[#ffefe5]">{t('styles')}</h3>
                        </div>
                        
                        <div className="space-y-6">
                            {/* Aviso de alcance: aquí sólo aparece lo que ESTA
                                plantilla aplica de verdad en el perfil público. */}
                            <p className="text-[11px] text-[#ffefe5]/45 leading-relaxed -mt-2">
                                {t('appearance_styles_scope_note')}
                            </p>

                            {/* Color Palette */}
                            {(can('backgroundColor') || can('buttonColor') || can('buttonTextColor') || can('textColor')) && (
                                <div className="grid grid-cols-2 gap-4">
                                    {can('backgroundColor') && colorField('backgroundColor', 'background_label', '#210900')}
                                    {can('buttonColor') && colorField('buttonColor', 'button_label', '#ff6600')}
                                    {can('buttonTextColor') && colorField('buttonTextColor', 'button_text_label', '#ffffff')}
                                    {can('textColor') && colorField('textColor', 'main_text_label', '#ffefe5')}
                                </div>
                            )}

                            {/* Pro Plan Colors */}
                            {(profileData?.plan === 'pro' || profileData?.plan === 'ultra')
                                && (can('productsTextColor') || can('testimonialsTextColor')) && (
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#962700]/10">
                                    {can('productsTextColor') && colorField('productsTextColor', 'cta_button_label', '#ffffff')}
                                    {can('testimonialsTextColor') && colorField('testimonialsTextColor', 'testimonials_text_label', '#ffffff')}
                                </div>
                            )}

                            {/* Typography & Borders */}
                            {(can('fontFamily') || can('buttonStyle')) && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-[#962700]/10">
                                    {can('fontFamily') && (
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-[#ffefe5]/40 uppercase tracking-widest">{t('font_label')}</label>
                                            <select
                                                name="fontFamily"
                                                value={profileData.fontFamily || 'System'}
                                                onChange={handleInputChange as any}
                                                className="w-full p-3 rounded-xl bg-black/20 border border-[#962700]/30 text-[#ffefe5] focus:outline-none focus:ring-2 focus:ring-[#ff6600]/50 focus:border-[#ff6600] transition-all min-h-[48px]"
                                            >
                                                <option value="'Space Grotesk', sans-serif">Space Grotesk</option>
                                                <option value="'Poppins', sans-serif">Poppins</option>
                                                <option value="'Merriweather', serif">Merriweather</option>
                                                <option value="'Roboto Mono', monospace">Roboto Mono</option>
                                                <option value="System">{t('default')}</option>
                                                <option value="Arial">Arial</option>
                                                <option value="Verdana">Verdana</option>
                                                <option value="Georgia">Georgia</option>
                                            </select>
                                        </div>
                                    )}
                                    {can('buttonStyle') && (
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-[#ffefe5]/40 uppercase tracking-widest">{t('button_style_label')}</label>
                                            <select name="buttonStyle" value={profileData.buttonStyle || 'rounded'} onChange={handleInputChange} className="w-full p-3 rounded-xl bg-black/20 border border-[#962700]/30 text-[#ffefe5] focus:outline-none focus:ring-2 focus:ring-[#ff6600]/50 focus:border-[#ff6600] transition-all min-h-[48px]">
                                                <option value="rounded">{t('rounded')}</option>
                                                <option value="sharp">{t('sharp')}</option>
                                                <option value="pills">{t('pill')}</option>
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Border Settings */}
                            {(can('borderColor') || can('borderWidth')) && (
                                <div className="grid grid-cols-2 gap-4">
                                    {can('borderColor') && colorField('borderColor', 'border_label', '#962700')}
                                    {can('borderWidth') && (
                                        <div className="space-y-2">
                                            <label className="block text-xs font-bold text-[#ffefe5]/40 uppercase tracking-widest">{t('border_width_label')}</label>
                                            <div className="flex items-center gap-3 p-3 bg-black/20 rounded-xl border border-[#962700]/10 min-h-[66px]">
                                                <input
                                                    type="number"
                                                    name="borderWidth"
                                                    value={profileData.borderWidth || 0}
                                                    onChange={handleInputChange}
                                                    min="0"
                                                    max="10"
                                                    className="w-20 p-2 rounded-lg bg-[#210900] border border-[#962700]/30 text-[#ffefe5] focus:outline-none focus:border-[#ff6600]"
                                                />
                                                <span className="text-[#ffefe5]/60 text-sm font-bold uppercase italic font-tomorrow">px</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Shadow */}
                            {can('shadow') && (
                                <div className="space-y-2">
                                    <label className="block text-xs font-bold text-[#ffefe5]/40 uppercase tracking-widest">{t('shadow_label')}</label>
                                    <select name="shadow" value={profileData.shadow || 'none'} onChange={handleInputChange} className="w-full p-3 rounded-xl bg-black/20 border border-[#962700]/30 text-[#ffefe5] focus:outline-none focus:ring-2 focus:ring-[#ff6600]/50 focus:border-[#ff6600] transition-all min-h-[48px]">
                                        <option value="none">{t('no_shadow')}</option>
                                        <option value="soft">{t('soft_shadow')}</option>
                                        <option value="hard">{t('hard_shadow')}</option>
                                    </select>
                                </div>
                            )}

                            {/* Restaurar los colores de fábrica de esta plantilla.
                                Vacía los campos en lugar de escribir un color: así
                                la plantilla vuelve a usar sus propios respaldos y el
                                resultado es exactamente el de un perfil sin tocar. */}
                            <div className="pt-4 border-t border-[#962700]/10 space-y-2">
                                <button
                                    type="button"
                                    onClick={handleResetStyles}
                                    className="w-full flex items-center justify-center gap-2 p-3 rounded-xl bg-black/20 border border-[#962700]/30 text-[#ffefe5]/70 hover:text-[#ff6600] hover:border-[#ff6600]/50 active:scale-[0.99] transition-all min-h-[48px] text-xs font-bold uppercase tracking-widest"
                                >
                                    <RotateIcon />
                                    {t('appearance_reset_colors')}
                                </button>
                                <p className="text-[10px] text-[#ffefe5]/45 italic text-center">
                                    {stylesReset ? t('appearance_reset_done') : t('appearance_reset_hint')}
                                </p>
                            </div>
                        </div>
                    </Card>
                        
                    {/* Sección Horarios — sólo en plantillas que los publican.
                        stage, realty y sublima no dibujan horarios en ningún
                        punto de su perfil, así que ofrecer el editor sólo servía
                        para que el cliente llenara datos que nadie iba a ver. */}
                    {can('showSchedule') && (
                    <Card>
                        <div className="flex items-center gap-2 mb-6 pb-4 border-b border-[#962700]/20">
                            <div className="p-2 bg-[#ff6600]/10 rounded-xl text-[#ffa35d]">
                                <ClockIcon />
                            </div>
                            <h3 className="text-lg font-bold text-[#ffefe5]">{t('opening_hours')}</h3>
                        </div>
                        {profileData.showSchedule ? (
                            <div className="space-y-3">
                                {BUSINESS_DAY_KEYS.map(dayKey => {
                                    const dayData = Array.isArray(profileData.businessHours)
                                        ? profileData.businessHours.find((item: any) => item.day === dayKey) || { day: dayKey, isOpen: false, openTime: '', closeTime: '' }
                                        : { day: dayKey, isOpen: false, openTime: '', closeTime: '' };
                                    const label = dayLabels[dayKey] || dayKey.charAt(0).toUpperCase() + dayKey.slice(1);

                                    return (
                                        <div key={dayKey} className="p-4 rounded-xl bg-black/20 border border-[#962700]/10">
                                            <div className="flex items-center justify-between mb-4">
                                                <span className="font-bold text-[#ffefe5] uppercase italic font-tomorrow tracking-tight">{label}</span>
                                                <ToggleSwitch
                                                    checked={dayData.isOpen}
                                                    onChange={(checked) => handleHourChange(dayKey, 'isOpen', checked)}
                                                />
                                            </div>
                                            {dayData.isOpen && (
                                                <div className="flex items-center gap-3 pt-4 border-t border-[#962700]/10">
                                                    <span className="text-xs font-bold text-[#ffefe5]/40 uppercase tracking-widest leading-none">{t('from')}</span>
                                                    <input
                                                        type="time"
                                                        value={dayData.openTime || ''}
                                                        onChange={(e) => handleHourChange(dayKey, 'openTime', e.target.value)}
                                                        className="p-3 rounded-lg bg-[#210900] border border-[#962700]/30 text-[#ffefe5] focus:outline-none focus:border-[#ff6600] text-sm font-bold min-h-[48px]"
                                                    />
                                                    <span className="text-xs font-bold text-[#ffefe5]/40 uppercase tracking-widest leading-none">{t('to')}</span>
                                                    <input
                                                        type="time"
                                                        value={dayData.closeTime || ''}
                                                        onChange={(e) => handleHourChange(dayKey, 'closeTime', e.target.value)}
                                                        className="p-3 rounded-lg bg-[#210900] border border-[#962700]/30 text-[#ffefe5] focus:outline-none focus:border-[#ff6600] text-sm font-bold min-h-[48px]"
                                                    />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-black/20 flex items-center justify-center text-[#ff6600]/20 border border-[#962700]/10">
                                    <ClockIcon />
                                </div>
                                <p className="text-[#ffefe5]/40 font-bold uppercase italic font-tomorrow tracking-widest">{t('schedule_disabled_hint')}</p>
                            </div>
                        )}
                    </Card>
                    )}

                </div>
                {/* Vista previa: solo en pantallas grandes. En móvil se oculta para
                    que el formulario haga scroll libre (la vista previa viva tiene
                    elementos position:fixed y scroll interno que bloqueaban el scroll). */}
                <div className="hidden lg:block lg:col-span-1">
                    <MobilePreview profileData={profileData} links={links} />
                </div>
            </div>
        </div>
    );
};
