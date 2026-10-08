import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  back?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, subtitle, back, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-row">
        {back && (
          <Link to={back} className="back-link" aria-label="Voltar">
            <ChevronLeft size={22} />
          </Link>
        )}
        <h1>{title}</h1>
        {actions}
      </div>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}
