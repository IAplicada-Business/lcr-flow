import { AlertTriangle } from "lucide-react";
import { mensagemErroDocumento } from "@/lib/documento-erros";
import { cn } from "@/lib/utils";

export function DocumentoErroHint({
  classificacao_ia,
  compact = false,
  className,
}: {
  classificacao_ia?: unknown;
  compact?: boolean;
  className?: string;
}) {
  const info = mensagemErroDocumento(classificacao_ia);
  if (!info) return null;

  if (compact) {
    return (
      <p className={cn("text-[11px] text-amber-800", className)} title={info.tecnico}>
        <span className="font-medium">{info.titulo}</span>
        <span className="text-amber-700"> — {info.acao}</span>
      </p>
    );
  }

  return (
    <div className={cn("rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900", className)}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">{info.titulo}</p>
          <p className="text-xs text-amber-800">{info.acao}</p>
          {info.tecnico && (
            <details className="text-[11px] text-amber-700">
              <summary className="cursor-pointer">Detalhe técnico</summary>
              <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono">{info.tecnico}</pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
