// ClickSight Theme Configuration - Mixpanel-inspired Dark Theme

export const theme = {
  // Background Colors
  colors: {
    background: {
      main: '#0A0A0F',
      card: '#16161F',
      elevated: '#1E1E2D',
      input: '#16161F',
      hover: '#1E1E2D',
    },

    // Accent Colors
    primary: '#9D6CFF',
    primaryHover: '#7B4FE0',
    primaryLight: '#B894FF',

    success: '#52C41A',
    error: '#F5222D',
    warning: '#FAAD14',
    info: '#1890FF',

    // Text Colors
    text: {
      primary: '#FFFFFF',
      secondary: '#A8A8B8',
      muted: '#6B6B7B',
      disabled: '#4A4A5A',
    },

    // Border Colors
    border: {
      subtle: '#2A2A3A',
      elevated: '#3A3A4A',
      focus: '#9D6CFF',
    },

    // Chart Colors (for multi-line charts)
    chart: [
      '#9D6CFF', // Purple
      '#1890FF', // Blue
      '#13C2C2', // Cyan
      '#52C41A', // Green
      '#FAAD14', // Orange
      '#EB2F96', // Pink
      '#722ED1', // Deep Purple
      '#FA8C16', // Dark Orange
      '#A0D911', // Lime
      '#2F54EB', // Indigo
    ],
  },

  // Typography
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    fontSize: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '18px',
      xl: '20px',
      xxl: '24px',
      xxxl: '32px',
    },
    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeight: {
      tight: 1.2,
      normal: 1.5,
      relaxed: 1.75,
    },
  },

  // Spacing
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '16px',
    lg: '24px',
    xl: '32px',
    xxl: '48px',
    xxxl: '64px',
  },

  // Border Radius
  borderRadius: {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    round: '50%',
  },

  // Shadows
  shadows: {
    sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
    md: '0 4px 6px rgba(0, 0, 0, 0.4)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.5)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.6)',
  },

  // Transitions
  transitions: {
    fast: '150ms ease-in-out',
    normal: '250ms ease-in-out',
    slow: '350ms ease-in-out',
  },

  // Z-index scale
  zIndex: {
    dropdown: 1000,
    sticky: 1020,
    fixed: 1030,
    modalBackdrop: 1040,
    modal: 1050,
    popover: 1060,
    tooltip: 1070,
  },
};

// Helper functions
export const getChartColor = (index: number): string => {
  return theme.colors.chart[index % theme.colors.chart.length];
};

export const hexToRgba = (hex: string, alpha: number): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export default theme;
