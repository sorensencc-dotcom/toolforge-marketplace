import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TrendingSection from './TrendingSection.jsx';

const skills = [
  { id: 1, name: 'alpha', description: 'a', category: 'linting', rating: { average: 4.5, count: 10 }, installs7d: 100, installs30d: 300, growthPct: 34.5, trendDirection: 'up' },
  { id: 2, name: 'beta', description: 'b', category: 'testing', rating: { average: 3.9, count: 5 }, installs7d: 40, installs30d: 200, growthPct: -8.3, trendDirection: 'down' },
];

describe('TrendingSection', () => {
  it('renders an empty state with no skills', () => {
    render(<TrendingSection skills={[]} />);
    expect(screen.getByText(/no trending data/i)).toBeInTheDocument();
  });

  it('renders growth badges with sign', () => {
    render(<TrendingSection window="7d" skills={skills} />);
    expect(screen.getByText('+34.5%')).toBeInTheDocument();
    expect(screen.getByText('-8.3%')).toBeInTheDocument();
  });

  it('shows the active window in the heading', () => {
    render(<TrendingSection window="30d" skills={skills} />);
    expect(screen.getByText(/past 30 days/i)).toBeInTheDocument();
  });

  it('calls onSelect with the skill id when a card is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TrendingSection window="7d" skills={skills} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /alpha, rank 1/i }));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
