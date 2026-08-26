import React, { useEffect } from 'react';

// Spinner component for loading states
const Spinner = () => (
  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  children: React.ReactNode;
  /**
   * Aplica el estilo de botón al elemento hijo en lugar de envolverlo.
   * Sin esto, un <a> dentro de <Button> quedaba anidado en un <button>
   * (HTML inválido) y `asChild` viajaba al DOM como atributo desconocido.
   */
  asChild?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  asChild = false,
  ...props
}) => {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  };
  
  const variantClasses = {
    primary: 'glass-button text-white font-bold border border-transparent',
    secondary: 'bg-transparent border border-[#ff6600] text-[#ff6600] hover:bg-[#ff6600]/10',
    ghost: 'text-[#ffefe5]/70 hover:text-[#ffefe5] hover:bg-white/5',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-500/20'
  };
  
  const baseClasses = 'inline-flex items-center justify-center gap-2 font-medium font-sans rounded-xl transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#210900] focus:ring-[#ff6600] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 active:scale-95 min-h-[48px] px-6';
  
  const composedClasses = `${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`;

  // asChild: se pinta el hijo (típicamente un <a>) con el estilo del botón,
  // en vez de anidarlo dentro de un <button>.
  if (asChild && React.isValidElement(children)) {
    const child = children as React.ReactElement<{ className?: string }>;
    return React.cloneElement(child, {
      className: `${composedClasses} ${child.props.className ?? ''}`.trim(),
    });
  }

  return (
    <button
      className={composedClasses}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, icon, id, className = '', ...props }) => {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
            {icon}
          </div>
        )}
        <input
          id={id}
          className={`glass-input w-full rounded-xl px-4 py-3 text-white font-sans placeholder:text-white/40 min-h-[48px] outline-none ${icon ? 'pl-11' : ''} ${error ? 'border-red-500 focus:ring-red-500/10 focus:border-red-500' : ''} ${className}`}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea: React.FC<TextareaProps> = ({ label, error, id, className = '', ...props }) => {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={`glass-input w-full rounded-xl px-4 py-3 text-white font-sans placeholder:text-white/40 resize-vertical min-h-[120px] outline-none ${error ? 'border-red-500 focus:ring-red-500/50 focus:border-red-500' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  children: React.ReactNode;
}

export const Select: React.FC<SelectProps> = ({ label, error, id, children, ...props }) => {
  return (
    <div className="w-full space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-[var(--text-secondary)]">
          {label}
        </label>
      )}
      <select
        id={id}
        className={`glass-input w-full rounded-xl px-4 py-3 text-white font-sans min-h-[44px] outline-none appearance-none cursor-pointer ${error ? 'border-red-500' : ''}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
};

// Extiende los atributos del div para que style, draggable y los manejadores
// de arrastre lleguen al DOM. Antes se descartaban en silencio: por eso el
// reordenamiento por arrastre de la lista de enlaces no hacía nada.
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  shadow?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  padding = 'md',
  shadow = 'md',
  ...props
}) => {
  const paddingClasses = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-8'
  };
  
  const shadowClasses = {
    none: '',
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg'
  };
  
  return (
    <div className={`glass-panel rounded-[var(--radius-lg)] overflow-hidden ${paddingClasses[padding]} ${className}`} {...props}>
      {children}
    </div>
  );
};

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  // Se pasaba desde LinksTab y se ignoraba: el interruptor seguía siendo
  // accionable cuando debía estar bloqueado.
  disabled?: boolean;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ checked, onChange, label, disabled = false }) => {
  return (
    <label className={`inline-flex items-center gap-3 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} min-h-[48px] px-2 -mx-2 group rounded-xl hover:bg-white/5 transition-colors`}>
      <div className="relative">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          disabled={disabled}
          className="sr-only peer"
        />
        <div className="w-12 h-6 bg-[var(--background-elevated)] rounded-full border border-[var(--dark-orange)]/20 peer peer-checked:bg-[var(--primary-orange)] peer-checked:border-[var(--primary-orange)]/50 transition-all duration-300 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:shadow-md after:transition-all after:duration-300 peer-checked:after:translate-x-6"></div>
      </div>
      {label && <span className="text-sm font-bold text-[var(--text-secondary)] group-hover:text-white transition-colors">{label}</span>}
    </label>
  );
};

export interface NotificationProps {
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  onClose: () => void;
}

export const Notification: React.FC<NotificationProps> = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const typeStyles = {
    success: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
    error: 'bg-red-500/10 border-red-500/30 text-red-400',
    warning: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
    info: 'bg-blue-500/10 border-blue-500/30 text-blue-400'
  };
  
  const icons = {
    success: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
      </svg>
    ),
    error: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )
  };

  return (
    <div className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-[var(--radius-lg)] border backdrop-blur-sm shadow-lg animate-slide-in-right flex items-center gap-3 ${typeStyles[type]}`} role="alert">
      {icons[type]}
      <span className="font-medium text-sm">{message}</span>
      <button onClick={onClose} className="ml-2 p-1 hover:bg-white/10 rounded transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary';
  size?: 'sm' | 'md';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', size = 'sm', className = '' }) => {
  const variantClasses = {
    default: 'bg-[var(--background-elevated)] text-[var(--text-secondary)] border-[var(--card-border)]',
    primary: 'bg-[var(--primary-orange)]/10 text-[var(--primary-orange)] border-[var(--primary-orange)]/20',
    success: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    warning: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    error: 'bg-red-500/10 text-red-400 border-red-500/20',
    info: 'bg-blue-500/10 text-blue-400 border-blue-500/20'
  };
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm'
  };
  
  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}>
      {children}
    </span>
  );
};

interface KPICardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  icon: React.ReactNode;
  trend?: 'up' | 'down' | 'flat';
}

export const KPICard: React.FC<KPICardProps> = ({ title, value, change, changeType = 'neutral', icon, trend }) => {
  return (
    <Card className="hover:shadow-lg transition-shadow duration-300">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--text-secondary)]">{title}</p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{value}</p>
          {change && (
            <div className="mt-2 flex items-center gap-1">
              {trend === 'up' && <span className="text-emerald-400">↑</span>}
              {trend === 'down' && <span className="text-red-400">↓</span>}
              <span className={`text-sm font-medium ${
                changeType === 'positive' ? 'text-emerald-400' : 
                changeType === 'negative' ? 'text-red-400' : 'text-[var(--text-muted)]'
              }`}>
                {change}
              </span>
            </div>
          )}
        </div>
        <div className="p-3 bg-[var(--primary-orange)]/10 rounded-[var(--radius-md)] text-[var(--primary-orange)]">
          {icon}
        </div>
      </div>
    </Card>
  );
};