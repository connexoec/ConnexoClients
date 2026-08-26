import React from 'react';

interface IconProps {
    className?: string;
    strokeWidth?: number;
}

const defaultIconProps = {
  className: "h-5 w-5",
  strokeWidth: 2,
};

export const LinkIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
  <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" />
  </svg>
);

export const EyeIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
  <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const BarChartIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
  <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" x2="12" y1="20" y2="10" />
    <line x1="18" x2="18" y1="20" y2="4" />
    <line x1="6" x2="6" y1="20" y2="16" />
  </svg>
);

export const UserIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
  <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export const GripVerticalIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className || "h-5 w-5 text-[var(--text-secondary)]"} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" />
    </svg>
);

export const TrashIcon: React.FC<IconProps> = ({ className }) => (
    <svg className={className || "h-5 w-5 text-red-400"} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
);

export const InstagramIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
    </svg>
);

export const TwitterIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 3a10.9 10.9 0 0 1-3.14 1.53 4.48 4.48 0 0 0-7.86 3v1A10.66 10.66 0 0 1 3 4s-4 9 5 13a11.64 11.64 0 0 1-7 2c9 5 20 0 20-11.5a4.5 4.5 0 0 0-.08-.83A7.72 7.72 0 0 0 23 3z"></path>
    </svg>
);

export const LinkedInIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle>
    </svg>
);

export const GitHubIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
    </svg>
);

export const FacebookIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
    </svg>
);

export const TikTokIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.02 2.98a4.78 4.78 0 0 1 4.5 4.5v10.52a2.49 2.49 0 1 1-5 0V8.48a4.78 4.78 0 0 1-4.5-4.5h0a4.78 4.78 0 0 1 5-4.5z" />
    </svg>
);

export const YouTubeIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 17a24.12 24.12 0 0 1 0-10C2.5 6 7.5 4 12 4s9.5 2 9.5 3a24.12 24.12 0 0 1 0 10c0 1-5 3-9.5 3s-9.5-2-9.5-3Z"/>
        <path d="m10 15 5-3-5-3z"/>
    </svg>
);

export const ShareIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
    </svg>
);

export const WhatsAppIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21l1.65 -3.8a9 9 0 1 1 3.4 2.9l-5.05 .9" />
        <path d="M9 10a.5 .5 0 0 0 1 0v-1a.5 .5 0 0 0 -1 0v1a5 5 0 0 0 5 5h1a.5 .5 0 0 0 0 -1h-1a4 4 0 0 1 -4 -4v-1a.5 .5 0 0 0 -1 0v1" />
    </svg>
);

export const EmailIcon: React.FC<IconProps> = ({ className, strokeWidth }) => (
    <svg className={className || defaultIconProps.className} strokeWidth={strokeWidth || defaultIconProps.strokeWidth} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"></path>
    </svg>
);


// Icon Display Component
const iconMap: { [key: string]: React.FC<IconProps> } = {
    instagram: InstagramIcon,
    twitter: TwitterIcon,
    linkedin: LinkedInIcon,
    github: GitHubIcon,
    facebook: FacebookIcon,
    tiktok: TikTokIcon,
    youtube: YouTubeIcon,
    link: LinkIcon,
};

export const IconDisplay: React.FC<{ name?: string, className?: string }> = ({ name, className }) => {
    const IconComponent = name && iconMap[name] ? iconMap[name] : LinkIcon;
    return <IconComponent className={className || defaultIconProps.className} />;
};