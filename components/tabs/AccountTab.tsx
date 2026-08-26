import React, { useState } from 'react';
import { Card, Button, Input } from '../ui';
import { supabase } from '../../src/lib/supabase';
import { useLanguage } from '../../contexts/LanguageContext';

interface AccountTabProps {
    showNotification: (message: string, type: 'success' | 'error') => void;
    user: any;
    profileData: any;
    setProfileData: React.Dispatch<React.SetStateAction<any>>;
}

export const AccountTab: React.FC<AccountTabProps> = ({ 
    showNotification, 
    user, 
    profileData, 
    setProfileData 
}) => {
    const { t } = useLanguage();
    const [isSavingDetails, setIsSavingDetails] = useState(false);
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

    const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setPasswords(prev => ({ ...prev, [e.target.id]: e.target.value }));
    };

    // El correo de acceso NO se puede cambiar desde la app: al hacerlo el perfil
    // quedaba desincronizado con auth.users y desaparecía del Super Admin.
    // Aquí solo se guarda el nombre de usuario.
    const handleProfileUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        const newUsername = profileData.username;

        setIsSavingDetails(true);
        try {
            const { error: dbError } = await supabase.from('profiles').update({
                username: newUsername
            }).eq('id', user.id);
            if (dbError) throw dbError;

            showNotification(t('account_updated_success'), 'success');

        } catch (error: any) {
            showNotification(error?.message || t('account_save_error'), 'error');
        } finally {
            setIsSavingDetails(false);
        }
    };

    // ── Información de contacto ──────────────────────────────────────────
    // Vivía en la pestaña Enlaces; se movió aquí porque son datos de la cuenta,
    // no enlaces. Los campos siguen siendo los mismos de profiles.
    const [isSavingContact, setIsSavingContact] = useState(false);

    const handleContactUpdate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setIsSavingContact(true);
        try {
            const { error } = await supabase.from('profiles').update({
                phone: profileData.phone || null,
                contactEmail: profileData.contactEmail || null,
                whatsapp: profileData.whatsapp || null,
                location: profileData.location || null,
            }).eq('id', user.id);
            if (error) throw error;
            showNotification(t('account_updated_success'), 'success');
        } catch (error: any) {
            showNotification(error?.message || t('account_save_error'), 'error');
        } finally {
            setIsSavingContact(false);
        }
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

        if (website) vCardLines.push(`URL:${website}`);
        vCardLines.push('END:VCARD');

        const blob = new Blob([vCardLines.join('\n')], { type: 'text/vcard' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${profileData.displayName || 'contacto'}.vcf`;
        link.click();
        window.URL.revokeObjectURL(url);
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        const { current, new: newPassword, confirm } = passwords;

        if (!user) return;

        if (!current || !newPassword || !confirm) {
            showNotification(t('account_password_fill_all'), 'error');
            return;
        }

        if (newPassword !== confirm) {
            showNotification(t('account_password_mismatch'), 'error');
            return;
        }

        if (newPassword.length < 6) {
            showNotification(t('account_password_min_length'), 'error');
            return;
        }

        setIsUpdatingPassword(true);

        try {
            const { error } = await supabase.auth.updateUser({ password: newPassword });
            if (error) throw error;
            
            setPasswords({ current: '', new: '', confirm: '' });
            showNotification(t('account_password_updated_success'), 'success');

        } catch (error: any) {
            showNotification(t('account_password_update_error'), 'error');
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    if (!profileData) {
        return <div>{t('account_loading')}</div>;
    }

    return (
        <div className="space-y-6 md:space-y-12 max-w-4xl mx-auto px-5 md:px-0 pb-32 animate-fade-in-up">
            <div className="mb-6 md:mb-8 text-center md:text-left">
                <h2 className="text-2xl font-bold font-sans text-[#ffefe5]">
                    {t('account_tab_header_title')}
                </h2>
                <p className="text-sm font-sans text-[#ffefe5]/70 mt-1 md:mt-2">
                    {t('account_tab_desc')}
                </p>
            </div>
             <Card className="space-y-6">
                <div className="border-b border-[var(--dark-orange)]/20 pb-4">
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">{t('account_details_title')}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{t('account_details_desc')}</p>
                </div>
                <form className="space-y-6" onSubmit={handleProfileUpdate}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            id="username"
                            label={t('account_username_label')}
                            value={profileData?.username || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, username: e.target.value }))}
                        />
                        <div>
                            <Input
                                id="email"
                                label={t('account_email_label')}
                                type="email"
                                value={user?.email || profileData?.email || ''}
                                readOnly
                                disabled
                                className="opacity-60 cursor-not-allowed"
                            />
                            <p className="text-xs text-[var(--text-muted)] mt-1.5">
                                🔒 {t('account_email_locked_note')}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button type="submit" disabled={isSavingDetails} className="w-full sm:w-auto">
                            {isSavingDetails ? t('saving') : t('save_changes')}
                        </Button>
                    </div>
                </form>
             </Card>
             {/* Información de contacto (movida desde la pestaña Enlaces) */}
             <Card className="space-y-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[var(--dark-orange)]/20 pb-4">
                    <div>
                        <h3 className="text-xl font-bold text-[var(--text-primary)]">{t('links_tab_contact_info_title')}</h3>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">{t('account_contact_desc')}</p>
                    </div>
                    <Button variant="primary" size="sm" onClick={generateVCard} className="w-full sm:w-auto shrink-0">
                        {t('links_tab_download_vcard')}
                    </Button>
                </div>
                <form className="space-y-6" onSubmit={handleContactUpdate}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            label={t('links_tab_contact_phone')}
                            value={profileData.phone || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                            placeholder="+1234567890"
                        />
                        <Input
                            label={t('links_tab_contact_email')}
                            value={profileData.contactEmail || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, contactEmail: e.target.value }))}
                            placeholder="tu@email.com"
                        />
                        <Input
                            label={t('links_tab_contact_whatsapp')}
                            value={profileData.whatsapp || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, whatsapp: e.target.value }))}
                            placeholder="+1234567890"
                        />
                        <Input
                            label={t('links_tab_contact_location')}
                            value={profileData.location || ''}
                            onChange={(e) => setProfileData(prev => ({ ...prev, location: e.target.value }))}
                            placeholder="Ciudad, País"
                        />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button type="submit" disabled={isSavingContact} className="w-full sm:w-auto">
                            {isSavingContact ? t('saving') : t('save_changes')}
                        </Button>
                    </div>
                </form>
             </Card>
             <Card className="space-y-6">
                <div className="border-b border-[var(--dark-orange)]/20 pb-4">
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">{t('account_change_password_title')}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{t('account_change_password_desc')}</p>
                </div>
                <form className="space-y-6" onSubmit={handleChangePassword}>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Input
                            id="current"
                            label={t('account_current_password_label')}
                            type="password"
                            value={passwords.current}
                            onChange={handlePasswordChange}
                        />
                        <Input
                            id="new"
                            label={t('account_new_password_label')}
                            type="password"
                            value={passwords.new}
                            onChange={handlePasswordChange}
                        />
                    </div>
                    <Input
                        id="confirm"
                        label={t('account_confirm_password_label')}
                        type="password"
                        value={passwords.confirm}
                        onChange={handlePasswordChange}
                    />
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button type="submit" disabled={isUpdatingPassword} className="w-full sm:w-auto">
                            {isUpdatingPassword ? t('updating') : t('update_password')}
                        </Button>
                    </div>
                </form>
             </Card>
             <Card className="space-y-6">
                <div className="border-b border-[var(--dark-orange)]/20 pb-4">
                    <h3 className="text-xl font-bold text-[var(--text-primary)]">{t('account_billing_title')}</h3>
                    <p className="text-sm text-[var(--text-secondary)] mt-1">{t('account_billing_desc')}</p>
                </div>
                <div className="p-4 bg-black/20 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <p className="text-sm text-[var(--text-secondary)]">{t('current_plan')}</p>
                        <p className="text-lg font-bold text-[var(--text-primary)]">
                            {profileData?.plan === 'ultra' ? 'ULTRA' : (profileData?.plan === 'pro' ? 'PRO' : 'CONECTA')}
                        </p>
                        <p className="text-xs text-green-400">{t('plan_active')}</p>
                    </div>
                    {profileData?.plan !== 'ultra' && (
                        <Button variant="secondary" asChild className="w-full sm:w-auto">
                            <a
                                href={`https://wa.me/584226469177?text=${encodeURIComponent(
                                    profileData?.plan === 'pro' 
                                        ? t('upgrade_whatsapp_ultra') 
                                        : t('upgrade_whatsapp_pro')
                                )}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                {profileData?.plan === 'pro' ? t('upgrade_to_ultra') : t('upgrade_to_pro_or_ultra')}
                            </a>
                        </Button>
                    )}
                </div>
            </Card>
        </div>
    );
};
