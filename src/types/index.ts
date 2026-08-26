// src/types/index.ts
export interface UserLink {
  id: string;
  title: string;
  url: string;
  isActive: boolean;
  clicks?: number;
}

export interface Testimonial {
  id: string;
  quote: string;
  author: string;
  authorTitle?: string;
  authorImageURL?: string;
}

export interface ContactInfo {
  email?: string;
  phone?: string;
  whatsapp?: string;
  location?: string;
}

export interface WeekHours {
  day: string;
  time: string;
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
}

export interface AppearanceSettings {
  backgroundColor: string;
  buttonColor: string;
  buttonTextColor: string;
  buttonStyle: string;
  borderColor: string;
  borderWidth: number;
  shadow: string;
  textColor?: string;
  fontFamily?: string;
}

export interface Product {
  id: string;
  name: string;
  description?: string;
  price?: string;
  imageURL?: string;
  linkURL?: string;
}

export interface SocialMediaLinks {
  instagram?: string;
  twitter?: string;
  linkedin?: string;
  facebook?: string;
  youtube?: string;
  tiktok?: string;
  github?: string;
  website?: string;
}

export interface DigitalFile {
  id: string;
  title: string;
  description?: string;
  fileURL: string;
  fileName: string;
  fileType: string;
  fileSize?: number;
  thumbnailURL?: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  order?: number;
}

export type SectionType = 'video' | 'links' | 'products' | 'gallery' | 'testimonials' | 'schedule' | 'files' | 'faqs';

export interface SectionOrder {
  type: SectionType;
  enabled: boolean;
  order: number;
}

export interface Profile {
  displayName: string;
  bio?: string;
  profilePhotoURL?: string;
  coverImageURL?: string;
  jobTitle?: string;
  company?: string;
  username?: string;
  email?: string;
  plan: string;
  showSchedule: boolean;
  darkMode: boolean;
  logoURL?: string;
  contactEmail?: string;
  phone?: string;
  location?: string;
  locations?: string[];
  whatsapp?: string;
  bookingLink?: string;
  theme?: string;
  backgroundColor: string;
  buttonColor: string;
  buttonTextColor: string;
  buttonStyle: string;
  borderColor: string;
  borderWidth: number;
  shadow: string;
  textColor?: string;
  fontFamily?: string;
  businessHours: WeekHours[];
  products: Product[];
  galleryImageURLs: string[];
  featuredVideoURL?: string;
  uploadedVideoURL?: string;
  galleryTitle?: string;
  testimonials: Testimonial[];
  socialMedia?: SocialMediaLinks;
  digitalFiles?: DigitalFile[];
  faqs?: FAQ[];
  sectionOrder?: SectionOrder[];
}
