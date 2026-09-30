import type { ReactNode } from 'react';

export function AuthShell({ title, children, footer }: { title: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="flex justify-center py-4 sm:py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-line bg-white p-6 shadow-float sm:p-9">
          <h1 className="text-xl font-bold text-fg">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm text-muted">{footer}</p>
      </div>
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-danger-soft px-3.5 py-3 text-sm text-danger">
      {message}
    </p>
  );
}
