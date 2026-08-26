import React, { useState, useRef, useEffect } from 'react';
import { useLanguage, languages } from '../contexts/LanguageContext';

type LanguageCode = keyof typeof languages;

export const LanguageSwitcher: React.FC = () => {
    const { language, setLanguage } = useLanguage();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const handleLanguageChange = (lang: LanguageCode) => {
        setLanguage(lang);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                aria-haspopup="true"
                aria-expanded={isOpen}
                className="flex items-center gap-2 px-2.5 min-w-[44px] h-[44px] md:min-w-[48px] md:h-[48px] text-xs font-bold rounded-[var(--radius-md)] transition-all duration-300 border border-[var(--dark-orange)]/40 text-[var(--text-primary)] bg-[var(--background-elevated)]/50 hover:bg-[var(--dark-orange)]/20 focus:outline-none"
            >
                <div className="flex items-center gap-2 mx-auto sm:mx-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 md:h-5 md:w-5 text-[var(--primary-orange)]"><circle cx="12" cy="12" r="10"></circle><line x1="2" y1="12" x2="22" y2="12"></line><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path></svg>
                    <span className="hidden sm:inline uppercase tracking-wider">{languages[language]}</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-3 w-3 md:h-4 md:w-4 transition-transform duration-200 opacity-60 ${isOpen ? 'rotate-180' : ''}`}><polyline points="6 9 12 15 18 9"></polyline></svg>
                </div>
            </button>
            {isOpen && (
                <div className="absolute right-0 z-[60] mt-2 w-40 rounded-[var(--radius-md)] border border-[var(--dark-orange)]/40 bg-[var(--background-card)] shadow-2xl backdrop-blur-md origin-top-right animate-fade-in-up">
                    <ul className="py-1" role="menu">
                        {(Object.keys(languages) as LanguageCode[]).map(langCode => (
                            <li key={langCode}>
                                <button
                                    onClick={() => handleLanguageChange(langCode)}
                                    className={`w-full text-left px-4 py-2 text-sm ${language === langCode ? 'font-bold text-[var(--primary-orange)]' : 'text-[var(--text-secondary)]'} hover:bg-[var(--dark-orange)] hover:text-[var(--text-primary)]`}
                                    role="menuitem"
                                >
                                    {languages[langCode]}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};