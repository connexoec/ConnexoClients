import React from 'react';
import { reportError } from '../src/lib/errorLogger';

// ─────────────────────────────────────────────────────────────────────────────
//  ErrorBoundary — atrapa cualquier crash del árbol de React, muestra una UI
//  amigable "Algo salió mal" y, en 2º plano, reporta el error a la base.
//
//  ⚠️ Debe ser autocontenido: usa SOLO estilos en línea y no depende de ningún
//  contexto (tema, idioma, router). Si lo que se rompió fue un provider, esta
//  pantalla igual se dibuja. Es una CLASE porque los boundaries de React solo
//  se pueden hacer con componentes de clase (no hay equivalente con hooks).
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode;
  /** Nombre de la vista/sección, para saber DÓNDE reventó. */
  name?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Reporte en 2º plano. reportError nunca lanza.
    reportError({
      message: error?.message || String(error),
      stack: error?.stack || info?.componentStack || null,
      component: this.props.name || 'ErrorBoundary',
      errorType: 'render',
      severity: 'critical', // un crash de render tumba la vista → es lo más grave
      metadata: { componentStack: info?.componentStack?.slice(0, 2000) },
    });
  }

  handleReload = () => {
    try { window.location.reload(); } catch { /* ignore */ }
  };

  handleHome = () => {
    try { window.location.assign('/'); } catch { /* ignore */ }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={S.wrap}>
        <div style={S.card}>
          <div style={S.icon}>⚠️</div>
          <h1 style={S.title}>Algo salió mal</h1>
          <p style={S.text}>
            Tuvimos un problema al mostrar esta parte. Nuestro equipo ya fue
            notificado automáticamente. Puedes intentar recargar la página.
          </p>
          <div style={S.row}>
            <button style={S.primary} onClick={this.handleReload}>Recargar</button>
            <button style={S.secondary} onClick={this.handleHome}>Ir al inicio</button>
          </div>
        </div>
      </div>
    );
  }
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    background: 'radial-gradient(circle at 50% 20%, #1a1005 0%, #0a0a0a 70%)',
    color: '#f5f5f5',
    fontFamily: "'Space Grotesk', system-ui, -apple-system, sans-serif",
  },
  card: {
    maxWidth: 420,
    width: '100%',
    textAlign: 'center',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '40px 28px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
  },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: 700, margin: '0 0 12px' },
  text: { fontSize: 15, lineHeight: 1.6, color: 'rgba(245,245,245,0.7)', margin: '0 0 28px' },
  row: { display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' },
  primary: {
    background: '#ff6b35',
    color: '#0a0a0a',
    border: 'none',
    borderRadius: 12,
    padding: '12px 24px',
    fontSize: 15,
    fontWeight: 700,
    cursor: 'pointer',
  },
  secondary: {
    background: 'transparent',
    color: '#f5f5f5',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: 12,
    padding: '12px 24px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
};

export default ErrorBoundary;
