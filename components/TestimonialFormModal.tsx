import React from 'react';
import { Button, Input, Card } from './ui';

// SVG Icons
const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CameraIcon = () => (
  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const SaveIcon = () => (
  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
  </svg>
);

interface TestimonialForm {
  quote: string;
  author: string;
  authorTitle: string;
  authorImageURL: string;
}

interface Testimonial {
  id: string;
  quote: string;
  author: string;
  authorTitle?: string;
  authorImageURL?: string;
}

interface TestimonialFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingTestimonial: Testimonial | null;
  testimonialForm: TestimonialForm;
  setTestimonialForm: React.Dispatch<React.SetStateAction<TestimonialForm>>;
  onSubmit: () => void;
  onImageUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const TestimonialFormModal: React.FC<TestimonialFormModalProps> = ({
  isOpen,
  onClose,
  editingTestimonial,
  testimonialForm,
  setTestimonialForm,
  onSubmit,
  onImageUpload
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--card-border)]">
          <h3 className="text-xl font-bold text-[var(--text-primary)]">
            {editingTestimonial ? 'Editar Testimonio' : 'Añadir Testimonio'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-[var(--radius-md)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--background-elevated)] transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Cita/Testimonio */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Cita/Testimonio *
            </label>
            <textarea
              value={testimonialForm.quote}
              onChange={(e) => setTestimonialForm(prev => ({ ...prev, quote: e.target.value }))}
              placeholder="Escribe la cita o testimonio aquí..."
              className="w-full bg-[var(--background-card)] border border-[var(--card-border)] rounded-[var(--radius-md)] px-4 py-3 text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-orange)]/50 focus:border-[var(--primary-orange)] transition-all duration-200 resize-vertical min-h-[120px]"
              required
            />
          </div>

          {/* Autor */}
          <Input
            type="text"
            label="Autor *"
            value={testimonialForm.author}
            onChange={(e) => setTestimonialForm(prev => ({ ...prev, author: e.target.value }))}
            placeholder="Nombre del autor"
            required
          />

          {/* Cargo/Título del Autor */}
          <Input
            type="text"
            label="Cargo/Título del Autor"
            value={testimonialForm.authorTitle}
            onChange={(e) => setTestimonialForm(prev => ({ ...prev, authorTitle: e.target.value }))}
            placeholder="Ej: CEO, Desarrollador, Cliente..."
          />

          {/* Foto del Autor */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Foto del Autor
            </label>
            <div className="flex items-center gap-4">
              {testimonialForm.authorImageURL && (
                <img
                  src={testimonialForm.authorImageURL}
                  alt="Vista previa"
                  className="w-16 h-16 rounded-full object-cover border-2 border-[var(--card-border)]"
                />
              )}
              <label className="cursor-pointer inline-flex items-center px-4 py-2 bg-[var(--background-elevated)] hover:bg-[var(--card-border)] text-[var(--text-primary)] rounded-[var(--radius-md)] transition-colors border border-[var(--card-border)]">
                <CameraIcon />
                Subir Foto
                <input
                  type="file"
                  accept="image/*"
                  onChange={onImageUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 mt-8 pt-4 border-t border-[var(--card-border)]">
          <Button onClick={onClose} variant="secondary">
            Cancelar
          </Button>
          <Button
            onClick={onSubmit}
            variant="primary"
          >
            <SaveIcon />
            {editingTestimonial ? 'Actualizar' : 'Guardar'}
          </Button>
        </div>
      </Card>
    </div>
  );
};
