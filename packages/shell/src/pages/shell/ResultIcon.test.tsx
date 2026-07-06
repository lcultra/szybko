import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ResultIcon } from './ResultIcon';

describe('ResultIcon', () => {
  it('renders emoji icon', () => {
    render(<ResultIcon icon={{ type: 'emoji', value: '🔥' }} title="Test" />);
    expect(screen.getByText('🔥')).toBeDefined();
  });

  it('renders first char fallback when no icon', () => {
    render(<ResultIcon title="Test" />);
    expect(screen.getByText('T')).toBeDefined();
  });

  it('renders first char fallback when icon is undefined', () => {
    render(<ResultIcon icon={undefined} title="Alpha" />);
    expect(screen.getByText('A')).toBeDefined();
  });

  it('renders img for url type', () => {
    const { container } = render(<ResultIcon icon={{ type: 'url', value: 'https://example.com/icon.png' }} title="Test" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('https://example.com/icon.png');
  });

  it('renders img for asset type', () => {
    const { container } = render(<ResultIcon icon={{ type: 'asset', value: 'assets/icon.svg' }} title="Test" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img!.getAttribute('src')).toBe('assets/icon.svg');
  });
});
