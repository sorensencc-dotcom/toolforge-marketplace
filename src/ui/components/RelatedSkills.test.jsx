import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RelatedSkills from './RelatedSkills.jsx';

const skills = Array.from({ length: 6 }, (_, i) => ({
  id: i + 1,
  name: `skill-${i + 1}`,
  category: 'linting',
  rating: { average: 4.0 + i * 0.1, count: i + 1 },
}));

describe('RelatedSkills', () => {
  it('renders nothing when there are no related skills', () => {
    const { container } = render(<RelatedSkills skillId={1} skills={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('caps the list at 5 and excludes the current skill', () => {
    render(<RelatedSkills skillId={1} skills={skills} />);
    // skill-1 is excluded; 5 of the remaining shown
    expect(screen.queryByText('skill-1')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('calls onSelect with the skill id', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<RelatedSkills skillId={1} skills={skills} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /skill-2/i }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
