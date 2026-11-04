import type { Project } from '../lib/types';
import { Icon } from './Icon';

interface Props {
  projects: Project[];
  value?: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

export function ProjectPicker({ projects, value, onChange, disabled }: Props) {
  const current = projects.find((p) => p.id === value);
  return (
    <label className="project-picker" style={{ '--accent': current?.color } as React.CSSProperties}>
      <span className="dot" />
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <span className="chevron" aria-hidden>
        <Icon name="dropdown" />
      </span>
    </label>
  );
}
