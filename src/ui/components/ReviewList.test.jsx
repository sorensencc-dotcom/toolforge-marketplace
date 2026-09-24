import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewList from './ReviewList.jsx';

const makeReviews = (n) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    score: (i % 5) + 1,
    reviewText: `Review ${i + 1}`,
    createdAt: '2026-07-01T00:00:00Z',
    updatedAt: '2026-07-01T00:00:00Z',
  }));

describe('ReviewList', () => {
  it('renders a loading state', () => {
    render(<ReviewList loading />);
    expect(screen.getByRole('status')).toHaveTextContent(/loading reviews/i);
  });

  it('renders an error state', () => {
    render(<ReviewList error="boom" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders an empty state', () => {
    render(<ReviewList reviews={[]} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });

  it('paginates with "Show More"', async () => {
    const user = userEvent.setup();
    render(<ReviewList reviews={makeReviews(7)} />);
    expect(screen.getByText('Review 5')).toBeInTheDocument();
    expect(screen.queryByText('Review 6')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /show more reviews/i }));
    expect(screen.getByText('Review 6')).toBeInTheDocument();
  });
});
