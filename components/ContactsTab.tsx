import React from 'react';
import { Card, Button, Badge } from './ui';
import { useLanguage } from '../contexts/LanguageContext';

// SVG Icons
const UserIcon = () => (
  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const DownloadIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const EnvelopeIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const PhoneIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

interface Lead {
  id: string;
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  visitorNotes?: string;
  status?: string;
  capturedAt?: { toDate: () => Date } | Date;
}

interface ContactsTabProps {
  leads: Lead[];
  onExport: () => void;
  onDelete: (id: string) => void;
  onUpdateStamps?: (leadId: string, newStamps: number) => Promise<void> | void;
  validationCode?: string;
  onSaveValidationCode?: (code: string) => Promise<void> | void;
  theme?: string;
}

export const ContactsTab: React.FC<ContactsTabProps> = ({ 
  leads, 
  onExport, 
  onDelete,
  onUpdateStamps,
  validationCode = '1234',
  onSaveValidationCode,
  theme
}) => {
  const { t } = useLanguage();
  const [editingCode, setEditingCode] = React.useState(validationCode);
  const [isSavingCode, setIsSavingCode] = React.useState(false);

  React.useEffect(() => {
    setEditingCode(validationCode);
  }, [validationCode]);

  const formatDate = (capturedAt: any): string => {
    if (!capturedAt) return 'Fecha no disponible';
    if (typeof capturedAt.toDate === 'function') {
      return new Date(capturedAt.toDate()).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return new Date(capturedAt).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="w-full pb-32">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8 md:space-y-12 animate-fade-in-up">
      {/* Header Section */}
      <div className="flex flex-col items-center sm:flex-row sm:items-center justify-between gap-4 mb-6 md:mb-8 text-center sm:text-left">
        <div>
          <h2 className="text-2xl font-bold font-sans text-[#ffefe5]">
            {t('contacts_tab_header_title')}
          </h2>
          <p className="text-sm font-sans text-[#ffefe5]/70 mt-1 md:mt-2">
            {t('contacts_tab_desc')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="primary" size="md">
            {leads.length} contactos
          </Badge>
          <Button 
            variant="secondary" 
            size="sm" 
            onClick={onExport}
            disabled={leads.length === 0}
          >
            <DownloadIcon />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Barber Fidelity Config (only shown for theme === 'barber') */}
      {theme === 'barber' && onSaveValidationCode && (
        <Card className="p-6 bg-gradient-to-br from-[var(--background-card)] to-[var(--background-elevated)] border border-[var(--primary-orange)]/25 mb-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h3 className="text-lg font-bold text-[var(--text-primary)] flex items-center gap-2">
                💈 Configuración de Fidelidad (Barbería)
              </h3>
              <p className="text-xs text-[var(--text-secondary)] mt-1">
                Define el código de 4 dígitos que tus clientes deben ingresar para obtener sellos en su tarjeta digital.
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                maxLength={8}
                value={editingCode}
                onChange={(e) => setEditingCode(e.target.value)}
                placeholder="Ej: 1234"
                className="w-24 p-2 text-center text-sm font-mono font-bold tracking-widest rounded-lg bg-[var(--background-elevated)] border border-white/10 text-white focus:outline-none focus:border-[var(--primary-orange)]"
              />
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  setIsSavingCode(true);
                  await onSaveValidationCode(editingCode);
                  setIsSavingCode(false);
                }}
                disabled={isSavingCode || !editingCode.trim()}
              >
                {isSavingCode ? 'Guardando...' : 'Guardar'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Empty State */}
      {leads.length === 0 ? (
        <Card className="py-16 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--background-elevated)] flex items-center justify-center text-[var(--text-muted)]">
            <UserIcon />
          </div>
          <h3 className="text-lg font-medium text-[var(--text-primary)]">No hay contactos aún</h3>
          <p className="text-sm text-[var(--text-secondary)] mt-2 max-w-md mx-auto">
            Los contactos que visiten tu perfil y compartan su información aparecerán aquí.
          </p>
        </Card>
      ) : (
        /* Contacts Grid */
        <div className="grid gap-4">
          {leads.map((lead, index) => {
            const isBarber = theme === 'barber';
            let displayName = lead.visitorName || 'Sin nombre';
            let stamps = 0;
            let clientCode = '';

            if (isBarber && displayName.includes('|')) {
              const parts = displayName.split('|');
              displayName = parts[0] || 'Sin nombre';
              stamps = parseInt(parts[1]) || 0;
              clientCode = parts[2] || '';
            }

            return (
              <Card 
                key={lead.id} 
                className="animate-fade-in-up"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="flex flex-col md:flex-row md:items-start gap-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--primary-orange)] to-[var(--dark-orange)] flex items-center justify-center">
                      <span className="text-white font-semibold text-lg">
                        {displayName.charAt(0)?.toUpperCase() || '?'}
                      </span>
                    </div>
                  </div>

                  {/* Contact Info */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-lg font-semibold text-[var(--text-primary)]">
                        {displayName}
                      </h4>
                      <Badge variant={lead.status === 'new' ? 'success' : 'default'} size="sm">
                        {lead.status === 'new' ? 'Nuevo' : 'Visto'}
                      </Badge>
                      {isBarber && (
                        <Badge variant="primary" size="sm">
                          {stamps} / 10 sellos
                        </Badge>
                      )}
                      {isBarber && clientCode && (
                        <Badge variant="default" size="sm" className="font-mono tracking-wider">
                          Código: {clientCode}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      {lead.visitorEmail && (
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <EnvelopeIcon />
                          <span>{lead.visitorEmail}</span>
                        </div>
                      )}
                      {lead.visitorPhone && (
                        <div className="flex items-center gap-2 text-[var(--text-secondary)]">
                          <PhoneIcon />
                          <span>{lead.visitorPhone}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[var(--text-muted)]">
                        <CalendarIcon />
                        <span>{formatDate(lead.capturedAt)}</span>
                      </div>
                    </div>

                    {lead.visitorNotes && (
                      <div className="mt-3 p-3 bg-[var(--background-elevated)] rounded-[var(--radius-md)]">
                        <p className="text-sm text-[var(--text-secondary)] italic">
                          "{lead.visitorNotes}"
                        </p>
                      </div>
                    )}

                    {isBarber && onUpdateStamps && (
                      <div className="flex items-center gap-2 mt-3 p-2 bg-[var(--background-elevated)] rounded-lg w-fit border border-white/5">
                        <span className="text-xs text-[var(--text-secondary)] mr-2 font-medium">Control de Sellos:</span>
                        <button
                          type="button"
                          onClick={() => onUpdateStamps(lead.id, Math.max(0, stamps - 1))}
                          disabled={stamps <= 0}
                          className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs font-bold text-gray-300 disabled:opacity-30 transition-colors"
                        >
                          -
                        </button>
                        <span className="font-mono text-xs font-bold w-5 text-center text-white">{stamps}</span>
                        <button
                          type="button"
                          onClick={() => onUpdateStamps(lead.id, Math.min(10, stamps + 1))}
                          disabled={stamps >= 10}
                          className="w-6 h-6 rounded bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs font-bold text-gray-300 disabled:opacity-30 transition-colors"
                        >
                          +
                        </button>
                        {stamps >= 10 && (
                          <button
                            type="button"
                            onClick={() => onUpdateStamps(lead.id, 0)}
                            className="ml-3 px-2 py-0.5 rounded bg-green-600 hover:bg-green-700 text-[9px] uppercase font-bold text-white tracking-wider active:scale-95 transition-all"
                          >
                            Reclamar Corte Gratis
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(lead.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      </div>
    </div>
  );
};
