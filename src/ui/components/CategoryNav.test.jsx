import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CategoryNav from './CategoryNav.jsx';

const categories = [
  { slug: 'linting', displayName: 'Linting', skillCount: 8 },
  { slug: 'testing', displayName: 'Testing', skillCount: 9 },
];

describe('CategoryNav', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/');
  });

  it('renders an option per category with skill counts', () => {
    render(<CategoryNav categories={categories} active="" onSelect={() => {}} />);
    expect(screen.getByRole('option', { name: /linting \(8\)/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /testing \(9\)/i })).toBeInTheDocument();
  });

  it('shows the summed total on the "all" option', () => {
    render(<CategoryNav categories={categories} active="" onSelect={() => {}} />);
    expect(screen.getByRole('option', { name: /all categories \(17\)/i })).toBeInTheDocument();
  });

  it('calls onSelect with the chosen slug', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<CategoryNav categories={categories} active="" onSelect={onSelect} />);
    await user.selectOptions(screen.getByRole('combobox'), 'testing');
    expect(onSelect).toHaveBeenCalledWith('testing');
  });

  it('persists the active category to the URL', () => {
    render(<CategoryNav categories={categories} active="linting" onSelect={() => {}} />);
    expect(window.location.search).toContain('category=linting');
  });
});
