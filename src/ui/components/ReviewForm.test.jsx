import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewForm from './ReviewForm.jsx';

describe('ReviewForm', () => {
  it('shows a sign-in prompt when unauthenticated', () => {
    render(<ReviewForm skillId={1} onSubmit={() => {}} authenticated={false} />);
    expect(screen.getByText(/sign in to rate/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('blocks submit without a star rating', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReviewForm skillId={1} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: /submit review/i }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/select a star rating/i);
  });

  it('submits score and text', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ReviewForm skillId={7} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('radio', { name: '5 stars' }));
    await user.type(screen.getByRole('textbox'), 'Great skill');
    await user.click(screen.getByRole('button', { name: /submit review/i }));
    expect(onSubmit).toHaveBeenCalledWith({ skillId: 7, score: 5, reviewText: 'Great skill' });
  });

  it('enforces the 200 character limit', () => {
    render(<ReviewForm skillId={1} onSubmit={() => {}} />);
    expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '200');
  });

  it('prefills an existing review in edit mode', () => {
    render(
      <ReviewForm skillId={1} onSubmit={() => {}} existingReview={{ score: 4, reviewText: 'Prior' }} />
    );
    expect(screen.getByRole('button', { name: /update review/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('Prior');
  });
});
