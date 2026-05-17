import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary: () => void;
}

export function ErrorFallback({ error, resetErrorBoundary }: ErrorFallbackProps) {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-brand-bg-primary min-h-[50vh]">
      <div className="bg-brand-bg-card/95 backdrop-blur-md border border-brand-border rounded-3xl p-8 md:p-12 max-w-md w-full text-center space-y-6 shadow-2xl">
        <div className="flex justify-center">
          <div className="w-16 h-16 bg-brand-red/10 rounded-2xl flex items-center justify-center border border-brand-red/30">
            <AlertCircle className="w-8 h-8 text-brand-red" />
          </div>
        </div>
        <div>
          <h2 className="text-xl font-display font-bold text-brand-text-white uppercase tracking-wider mb-2">Error al cargar</h2>
          <p className="text-xs text-brand-text-muted font-mono bg-black/20 p-3 rounded-xl border border-brand-border/30 break-all">
            {error.message || 'Error desconocido al cargar el componente'}
          </p>
        </div>
        <button
          onClick={resetErrorBoundary}
          className="inline-flex items-center space-x-2 bg-brand-green hover:bg-brand-green/90 text-black font-bold px-6 py-3 rounded-xl transition-all active:scale-[0.98] uppercase tracking-widest text-xs"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Reintentar</span>
        </button>
      </div>
    </div>
  );
}
