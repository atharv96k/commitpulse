import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CustomizeCTA } from './CustomizeCTA';

// Mock IntersectionObserver for framer-motion's viewport triggers
class IntersectionObserverMock {
  constructor() {}
  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverMock);

describe('CustomizeCTA - Responsive Rendering & UI Elements (Variation 3)', () => {
  it('should render the CustomizeCTA component successfully', () => {
    render(<CustomizeCTA />);

    // Verify the primary heading exists
    const heading = screen.getByText('Want to fine-tune your monolith?');
    expect(heading).toBeInTheDocument();

    // Verify the subtitle/description exists
    const description = screen.getByText(/swap accent colors, try a dark or neon theme/i);
    expect(description).toBeInTheDocument();
  });

  it('should apply responsive layout classes (flex-col to md:flex-row) to the main container', () => {
    render(<CustomizeCTA />);

    // Find the container holding the text and the button.
    // We can find it by finding the parent that contains both the heading and the link.
    const heading = screen.getByText('Want to fine-tune your monolith?');
    // The heading's parent is the text container
    const textContainer = heading.parentElement!;
    // The text container's parent is the main responsive flex container
    const mainContainer = textContainer.parentElement!;

    expect(mainContainer).toHaveClass('flex', 'flex-col', 'md:flex-row');

    // Verify the text alignment scales responsively
    expect(textContainer).toHaveClass('text-center', 'md:text-left');
  });

  it('should include correct path navigation to the custom URL generator', () => {
    render(<CustomizeCTA />);

    // Verify that the link is present and correctly routes to '/customize'
    const ctaLink = screen.getByRole('link', { name: /Open Customization Studio/i });
    expect(ctaLink).toBeInTheDocument();
    expect(ctaLink).toHaveAttribute('href', '/customize');
    expect(ctaLink).toHaveAttribute('id', 'open-customization-studio-cta');
  });

  it('should render the CTA button with correct screen reader attributes and responsive paddings', () => {
    render(<CustomizeCTA />);

    const ctaSpan = screen.getByText(/Open Customization Studio/i);
    expect(ctaSpan).toBeInTheDocument();
    expect(ctaSpan).toHaveClass('px-4', 'md:px-7'); // Responsive padding

    // Verify decorative elements are hidden from screen readers
    // In our component, the shimmer span and SVG have aria-hidden="true"
    const hiddenElements = ctaSpan.querySelectorAll('[aria-hidden="true"]');
    expect(hiddenElements.length).toBeGreaterThan(0);
  });
});
