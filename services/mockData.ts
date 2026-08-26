import type { UserLink, Profile, ContactInfo, Analytics, Account, AppearanceSettings, WeekHours } from '../types';

export const mockProfile: Profile = {
  displayName: "Jane Doe",
  jobTitle: "Diseñador UX/UI",
  company: "Connexo",
  bio: "Creando experiencias digitales intuitivas y hermosas. Conéctate conmigo a través de mis enlaces a continuación.",
  profilePhotoURL: "https://picsum.photos/seed/janedoe/200/200",
  coverImageURL: "https://picsum.photos/seed/cover/1000/400",
};

export const mockLinks: UserLink[] = [
  { id: '1', title: 'Portfolio Personal', url: 'https://example.com', isActive: true, order: 0, icon: 'link' },
  { id: '2', title: 'LinkedIn', url: 'https://linkedin.com', isActive: true, order: 1, icon: 'linkedin' },
  { id: '3', title: 'GitHub', url: 'https://github.com', isActive: true, order: 2, icon: 'github' },
  { id: '4', title: 'Twitter / X', url: 'https://twitter.com', isActive: false, order: 3, icon: 'twitter' },
  { id: '5', title: 'Instagram', url: 'https://instagram.com', isActive: true, order: 4, icon: 'instagram' },
];

export const mockOpeningHours: WeekHours = {
    monday: { isActive: true, start: '09:00', end: '17:00' },
    tuesday: { isActive: true, start: '09:00', end: '17:00' },
    wednesday: { isActive: true, start: '09:00', end: '17:00' },
    thursday: { isActive: true, start: '09:00', end: '17:00' },
    friday: { isActive: true, start: '09:00', end: '15:00' },
    saturday: { isActive: false, start: '10:00', end: '14:00' },
    sunday: { isActive: false, start: '', end: '' },
};

export const mockContactInfo: ContactInfo = {
  contactEmail: 'jane.doe@example.com',
  phone: '+1 123 456 7890',
  location: 'San Francisco, CA',
  whatsapp: '11234567890',
  openingHours: mockOpeningHours,
};

export const mockAnalytics: Analytics = {
  totalViews: 1260,
  totalClicks: 529,
  ctr: '42.0%',
  performanceSummary: [
    { day: 'Jan 1', views: 120, clicks: 40 },
    { day: 'Jan 2', views: 150, clicks: 50 },
    { day: 'Jan 3', views: 185, clicks: 65 },
    { day: 'Jan 4', views: 170, clicks: 70 },
    { day: 'Jan 5', views: 195, clicks: 80 },
    { day: 'Jan 6', views: 220, clicks: 95 },
    { day: 'Jan 7', views: 250, clicks: 105 },
  ],
  linkPerformance: [
    { id: '1', title: 'Instagram', clickCount: 245 },
    { id: '2', title: 'Website', clickCount: 187 },
    { id: '3', title: 'YouTube', clickCount: 98 },
    { id: '4', title: 'LinkedIn', clickCount: 52 },
  ]
};

export const mockAccount: Account = {
    username: 'janedoe',
    email: 'jane.doe@example.com',
    plan: 'Gratis',
};

export const mockAppearanceSettings: AppearanceSettings = {
    background: {
        type: 'solid',
        color: '#210900',
    },
    button: {
        style: 'rounded',
        backgroundColor: 'rgba(0, 0, 0, 0.3)',
        textColor: '#ffefe5',
        borderColor: '#962700',
        borderWidth: 2,
        shadow: 'soft'
    },
    typography: {
        fontFamily: 'Space Grotesk',
        textColor: '#ffefe5'
    }
};

// Simulate API calls
export const getProfile = async (): Promise<Profile> => {
  return new Promise(resolve => setTimeout(() => resolve(mockProfile), 500));
}

export const getLinks = async (): Promise<UserLink[]> => {
  return new Promise(resolve => setTimeout(() => resolve(mockLinks), 500));
}

export const getContactInfo = async (): Promise<ContactInfo> => {
    return new Promise(resolve => setTimeout(() => resolve(mockContactInfo), 500));
}

export const getAnalytics = async (): Promise<Analytics> => {
  return new Promise(resolve => setTimeout(() => resolve(mockAnalytics), 500));
}

export const getAccount = async (): Promise<Account> => {
    return new Promise(resolve => setTimeout(() => resolve(mockAccount), 500));
}

export const getAppearanceSettings = async (): Promise<AppearanceSettings> => {
    return new Promise(resolve => setTimeout(() => resolve(mockAppearanceSettings), 500));
}

export const signupUser = async (name: string, email: string, password: string): Promise<{ success: boolean; message?: string }> => {
    console.log('Attempting signup with:', { name, email, password });
    return new Promise(resolve => {
        setTimeout(() => {
            if (email === 'exists@example.com') {
                resolve({ success: false, message: 'Este email ya está registrado.' });
            } else {
                resolve({ success: true });
            }
        }, 1500);
    });
};

export const generateVCard = async (): Promise<string> => {
    return new Promise(resolve => {
        setTimeout(() => {
            const profile = mockProfile;
            const contact = mockContactInfo;

            const nameParts = profile.displayName.split(' ');
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';

            const vCard = `
BEGIN:VCARD
VERSION:3.0
FN:${profile.displayName}
N:${lastName};${firstName};;;
TITLE:${profile.jobTitle}
ORG:${profile.company}
EMAIL;TYPE=INTERNET,PREF:${contact.contactEmail}
TEL;TYPE=CELL,VOICE:${contact.phone}
ADR;TYPE=WORK:;;${contact.location};;;
END:VCARD
`.trim();

            resolve(vCard);
        }, 800);
    });
};

export const sendPasswordResetEmail = async (email: string): Promise<{ success: boolean; message?: string }> => {
    console.log('Sending password reset email to:', email);
    return new Promise(resolve => {
        setTimeout(() => {
            // In a real Firebase app, this call succeeds even if the email doesn't exist
            // to prevent user enumeration attacks. We simulate that behavior here.
            resolve({ success: true });
        }, 1000);
    });
};