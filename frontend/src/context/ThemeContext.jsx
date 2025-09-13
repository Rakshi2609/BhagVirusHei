import React, { createContext, useState, useEffect } from 'react';

// Create the theme context
const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Check if user has a theme preference in localStorage
    const savedTheme = localStorage.getItem('theme') || 'light';
    const [theme, setTheme] = useState(savedTheme);

    // Set theme on body element when it changes
    useEffect(() => {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    // Toggle theme function
    const toggleTheme = () => {
        setTheme(prevTheme => {
            const newTheme = prevTheme === 'light' ? 'dark' : 'light';
            return newTheme;
        });
    };

    return (
        <ThemeContext.Provider
            value={{
                theme,
                toggleTheme,
                isDark: theme === 'dark',
                isLight: theme === 'light'
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
};

export default ThemeContext;
