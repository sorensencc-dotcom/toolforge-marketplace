import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VersionPinSelector from './VersionPinSelector.jsx';

const versions = ['1.3.0', '1.2.5', '1.2.0', '0.9.0'];

describe('VersionPinSelector', () => {
  it('shows the constraint and resolved version', () => {
    const { container } = render(
      <VersionPinSelector versions={versions} constraint="^1.2.0" resolved="1.3.0" />
    );
    expect(screen.getByText('^1.2.0')).toBeInTheDocument();
    // 1.3.0 appears in both the resolved tag and the available list
    expect(container.querySelector('.version-resolved-tag')).toHaveTextContent('1.3.0');
    expect(screen.getAllByText('1.3.0').length).toBeGreaterThanOrEqual(1);
  });

  it('marks the resolved version as pinned', () => {
    render(<VersionPinSelector versions={versions} constraint="^1.2.0" resolved="1.3.0" />);
    expect(screen.getByText('pinned')).toBeInTheDocument();
  });

  it('renders a "no matching version" state when unresolved', () => {
    render(<VersionPinSelector versions={versions} constraint=">9.0.0" resolved={null} />);
    expect(screen.getByText(/no matching version/i)).toBeInTheDocument();
  });

  it('supports an editable constraint', async () => {
    const user = userEvent.setup();
    const onConstraintChange = vi.fn();
    render(
      <VersionPinSelector versions={versions} constraint="^1.0.0" resolved="1.3.0" onConstraintChange={onConstraintChange} />
    );
    await user.type(screen.getByRole('textbox'), '~');
    expect(onConstraintChange).toHaveBeenCalled();
  });
});
