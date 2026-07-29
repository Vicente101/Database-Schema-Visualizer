import AddCircleIcon from '@solar-icons/react/icons/ui/AddCircle';
import ChatRoundDotsIcon from '@solar-icons/react/icons/messages/ChatRoundDots';
import DatabaseIcon from '@solar-icons/react/icons/ui/Database';
import ImportIcon from '@solar-icons/react/icons/arrows-action/Import';

const HOME_TEMPLATES = [
  { key: 'ecommerce', label: 'E-Commerce', desc: 'Users, products, carts, orders, and payments', fit: 'Retail stores and marketplaces' },
  { key: 'blog', label: 'Blog', desc: 'Authors, posts, categories, and comments', fit: 'Publishing and editorial platforms' },
  { key: 'social', label: 'Social', desc: 'Users, posts, follows, likes, and messages', fit: 'Communities and social products' },
  { key: 'hr', label: 'HR', desc: 'Employees, departments, roles, and attendance', fit: 'People and workforce operations' },
  { key: 'crm', label: 'CRM', desc: 'Contacts, companies, deals, and activities', fit: 'Sales pipelines and client teams' },
  { key: 'inventory', label: 'Inventory', desc: 'Products, warehouses, stock, and suppliers', fit: 'Stock and fulfilment operations' },
  { key: 'healthcare', label: 'Healthcare', desc: 'Patients, doctors, appointments, and records', fit: 'Clinics and care-management systems' },
  { key: 'education', label: 'Education', desc: 'Students, courses, enrollments, and grades', fit: 'Schools and learning platforms' },
  { key: 'project', label: 'Projects', desc: 'Projects, tasks, sprints, and team members', fit: 'Delivery and planning workflows' },
  { key: 'erp', label: 'ERP System', desc: 'Finance, HR, sales, inventory, and operations', fit: 'Integrated enterprise management' },
] as const;

interface HomeWorkspaceProps {
  onLoadTemplate: (templateKey: string) => void;
  onCreate: () => void;
  onImport: () => void;
}

export function HomeWorkspace({ onLoadTemplate, onCreate, onImport }: HomeWorkspaceProps) {
  return (
    <div className="sv-empty flex h-full flex-col items-center bg-[#0f172a] p-5">
      <div className="sv-landing-content">
        <div className="sv-icon-bubble mb-6 grid size-[76px] place-items-center rounded-lg text-[#5eead4]">
          <DatabaseIcon size={44} weight="Linear" />
        </div>
        <h1 className="sv-landing-title mb-2 text-center text-[30px] font-extrabold text-[#f8fafc]">
          Database Schema Designer
        </h1>
        <p className="sv-landing-subtitle mb-[22px] max-w-[560px] text-center text-[15px] leading-[1.6] text-[#aeb7c2]">
          Start from a realistic schema template, import DDL, or build an architecture from scratch.
        </p>

        <div className="sv-template-picker mb-8 w-full max-w-[780px]">
          <div className="sv-template-picker-label mb-3 text-center text-xs uppercase tracking-[1px] text-slate-500">
            Choose a Template
          </div>
          <div className="sv-template-grid grid grid-cols-2 gap-2">
            {HOME_TEMPLATES.map((template) => (
              <button
                className="sv-template-button min-h-[80px] px-2.5 py-2 max-[620px]:min-h-[88px] max-[620px]:px-2"
                key={template.key}
                onClick={() => onLoadTemplate(template.key)}
                title={`Open the ${template.label} template`}
              >
                <span className="sv-template-corner" data-side="start" aria-hidden="true" />
                <span className="sv-template-corner" data-side="end" aria-hidden="true" />
                <div className="sv-template-heading">{template.label}</div>
                <div className="sv-template-body">
                  <section>
                    <strong>Core entities</strong>
                    <span>{template.desc}</span>
                  </section>
                  <section>
                    <strong>Designed for</strong>
                    <span>{template.fit}</span>
                  </section>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="sv-empty-actions sv-landing-actions flex items-center gap-4 text-[13px] text-slate-500">
          <span>or</span>
          <button
            onClick={onCreate}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-700 bg-transparent px-5 py-2.5 text-xs text-slate-400 transition-all duration-200"
          >
            <AddCircleIcon size={15} weight="Linear" />
            Start from Scratch
          </button>
          <button
            onClick={onImport}
            className="flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-700 bg-transparent px-5 py-2.5 text-xs text-slate-400 transition-all duration-200"
          >
            <ImportIcon size={15} weight="Linear" />
            Import SQL
          </button>
        </div>

        <p className="sv-assistant-ready mt-[30px] flex items-center gap-1.5 text-center text-[11px] text-[#66717e]">
          <ChatRoundDotsIcon size={15} weight="Linear" />
          Assistant ready
        </p>
      </div>
    </div>
  );
}
