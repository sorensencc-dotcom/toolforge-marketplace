import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RatingStars from './RatingStars.jsx';

describe('RatingStars', () => {
  it('renders a display rating with an accessible label', () => {
    render(<RatingStars value={4} />);
    expect(screen.getByRole('img', { name: /rated 4\.0 out of 5/i })).toBeInTheDocument();
  });

  it('renders "not yet rated" when value is 0', () => {
    render(<RatingStars value={0} />);
    expect(screen.getByRole('img', { name: /not yet rated/i })).toBeInTheDocument();
  });

  it('renders 5 interactive radios when editable', () => {
    render(<RatingStars value={3} editable onChange={() => {}} />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
  });

  it('calls onChange with the clicked star value', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<RatingStars value={0} editable onChange={onChange} />);
    await user.click(screen.getByRole('radio', { name: '4 stars' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });
});
