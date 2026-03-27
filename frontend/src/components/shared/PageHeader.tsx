import React from 'react';

interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary/80">Operations View</p>
        <h1 className="text-[1.75rem] font-semibold tracking-[-0.04em] md:text-[2rem]">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
        )}
      </div>
      {children && (
        <div className="flex shrink-0 items-center gap-2">
          {children}
        </div>
      )}
    </div>
  );
}
