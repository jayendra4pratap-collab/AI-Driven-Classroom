function ThemeSwitcher() {
    var s1 = React.useState(function () {
        return localStorage.getItem('theme') || 'light';
    });
    var theme = s1[0], setTheme = s1[1];

    React.useEffect(function () {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }, [theme]);

    return (
        <select className="theme-switcher" value={theme} onChange={function (e) { setTheme(e.target.value); }}>
            <option value="light">☀️ Light</option>
            <option value="dark">🌙 Dark</option>
            <option value="ocean">🌊 Ocean</option>
        </select>
    );
}