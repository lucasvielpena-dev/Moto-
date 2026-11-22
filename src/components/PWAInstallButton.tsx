import React, { useState } from 'react';
import { Download, ExternalLink, MoreVertical, Share } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } =
    usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const currentUrl =
    typeof window !== 'undefined' ? window.location.href : '/';

  return (
    <>
      <div className="rota-card px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[15px] font-extrabold text-[var(--rota-text)]">
            Aplicativo
          </h2>
          <p className="text-[13px] font-semibold text-[var(--rota-text-soft)]">
            Use offline na tela inicial
          </p>
        </div>

        {isInstallable ? (
          <button
            type="button"
            onClick={install}
            className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            Instalar
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setShowGuide(true)}
            className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-[14px] bg-[var(--rota-surface-2)] px-4 text-[14px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
          >
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            {isIOS ? 'Instalar' : 'Como instalar'}
          </button>
        )}
      </div>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
          style={{ backgroundColor: 'var(--rota-backdrop)' }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full sm:max-w-[460px] rounded-t-[20px] sm:rounded-[20px] bg-[var(--rota-bg)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="pwa-install-title"
                className="text-[20px] font-extrabold text-[var(--rota-text)]"
              >
                Instalar na tela inicial
              </h2>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="inline-flex min-h-[48px] items-center justify-center rounded-[14px] px-3 text-[15px] font-bold text-[var(--rota-text-soft)] hover:text-[var(--rota-text)]"
              >
                Fechar
              </button>
            </div>

            <div className="rota-card p-4 space-y-3">
              {isInIframe && (
                <div className="rounded-[14px] bg-[var(--rota-accent-tint)] p-3 space-y-2.5">
                  <p className="text-[13px] font-bold text-[var(--rota-text)] leading-snug">
                    Para instalar no celular, abra o app direto no navegador
                    (fora desta pré-visualização).
                  </p>
                  <a
                    href={currentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--rota-accent)] px-4 text-[14px] font-extrabold text-[var(--rota-on-accent)] active:scale-[0.98]"
                  >
                    <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
                    Abrir no navegador
                  </a>
                </div>
              )}

              {isIOS ? (
                <ol className="space-y-3 text-[14px] font-semibold text-[var(--rota-text-soft)] leading-relaxed">
                  <li className="flex items-start gap-2.5">
                    <span className="font-extrabold text-[var(--rota-text)]">
                      1.
                    </span>
                    <span>
                      Abra este endereço no{' '}
                      <strong className="font-extrabold text-[var(--rota-text)]">
                        Safari
                      </strong>{' '}
                      do iPhone.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-extrabold text-[var(--rota-text)]">
                      2.
                    </span>
                    <span>
                      Toque no botão{' '}
                      <strong className="inline-flex items-center gap-1 font-extrabold text-[var(--rota-text)]">
                        Compartilhar{' '}
                        <Share className="h-4 w-4 shrink-0" aria-hidden="true" />
                      </strong>{' '}
                      na barra inferior.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-extrabold text-[var(--rota-text)]">
                      3.
                    </span>
                    <span>
                      Toque em{' '}
                      <strong className="font-extrabold text-[var(--rota-text)]">
                        Adicionar à Tela de Início
                      </strong>{' '}
                      e confirme em{' '}
                      <strong className="font-extrabold text-[var(--rota-text)]">
                        Adicionar
                      </strong>
                      .
                    </span>
                  </li>
                </ol>
              ) : (
                <ol className="space-y-3 text-[14px] font-semibold text-[var(--rota-text-soft)] leading-relaxed">
                  <li className="flex items-start gap-2.5">
                    <span className="font-extrabold text-[var(--rota-text)]">
                      1.
                    </span>
                    <span>
                      Abra o link direto no{' '}
                      <strong className="font-extrabold text-[var(--rota-text)]">
                        Google Chrome
                      </strong>{' '}
                      do celular.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-extrabold text-[var(--rota-text)]">
                      2.
                    </span>
                    <span>
                      Toque no menu{' '}
                      <strong className="inline-flex items-center gap-0.5 font-extrabold text-[var(--rota-text)]">
                        <MoreVertical
                          className="h-4 w-4 shrink-0"
                          aria-hidden="true"
                        />
                        Mais opções
                      </strong>{' '}
                      no canto superior direito.
                    </span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="font-extrabold text-[var(--rota-text)]">
                      3.
                    </span>
                    <span>
                      Toque em{' '}
                      <strong className="font-extrabold text-[var(--rota-text)]">
                        Instalar aplicativo
                      </strong>{' '}
                      (ou{' '}
                      <strong className="font-extrabold text-[var(--rota-text)]">
                        Adicionar à tela inicial
                      </strong>
                      ).
                    </span>
                  </li>
                </ol>
              )}

              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-full min-h-[48px] rounded-[14px] bg-[var(--rota-surface-2)] text-[15px] font-extrabold text-[var(--rota-text)] active:scale-[0.98]"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
