function Dashboard(props) {
    var s1 = React.useState([]); var classrooms = s1[0], setClassrooms = s1[1];
    var s2 = React.useState(''); var name = s2[0], setName = s2[1];
    var s3 = React.useState(''); var section = s3[0], setSection = s3[1];
    var s4 = React.useState(''); var code = s4[0], setCode = s4[1];
    var s5 = React.useState(''); var error = s5[0], setError = s5[1];
    var s6 = React.useState(true); var loading = s6[0], setLoading = s6[1];

    function load() {
        setLoading(true);
        apiFetch('/classroom/mine')
            .then(function (data) { setClassrooms(data); setError(''); })
            .catch(function (e) { setError(e.message); })
            .finally(function () { setLoading(false); });
    }
    React.useEffect(function () { load(); }, []);

    function createClassroom(e) {
        e.preventDefault();
        apiFetch('/classroom/create', 'POST', { name: name, section: section })
            .then(function () { setName(''); setSection(''); load(); })
            .catch(function (e) { setError(e.message); });
    }

    function joinClassroom(e) {
        e.preventDefault();
        apiFetch('/classroom/join', 'POST', { code: code })
            .then(function () { setCode(''); load(); })
            .catch(function (e) { setError(e.message); });
    }

    function handleCopy(e, codeToCopy) {
        e.stopPropagation();
        copyText(codeToCopy);
        var btn = e.currentTarget;
        var original = btn.innerText;
        btn.innerText = '✅';
        setTimeout(function () { btn.innerText = original; }, 1200);
    }

    // Generate a consistent gradient per classroom based on its name
    var gradients = [
        'linear-gradient(135deg,#667eea,#764ba2)',
        'linear-gradient(135deg,#f093fb,#f5576c)',
        'linear-gradient(135deg,#4facfe,#00f2fe)',
        'linear-gradient(135deg,#43e97b,#38f9d7)',
        'linear-gradient(135deg,#fa709a,#fee140)',
        'linear-gradient(135deg,#30cfd0,#330867)',
        'linear-gradient(135deg,#a8edea,#fed6e3)',
        'linear-gradient(135deg,#ff9a9e,#fecfef)'
    ];
    function getGradient(str) {
        var hash = 0;
        for (var i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return gradients[Math.abs(hash) % gradients.length];
    }
    function getInitials(str) {
        if (!str) return '?';
        var parts = str.trim().split(' ');
        return parts.length > 1
            ? (parts[0][0] + parts[1][0]).toUpperCase()
            : parts[0].substring(0, 2).toUpperCase();
    }

    return (
        <div className="container dash-container">
            <div className="dash-header">
                <h2>👋 Welcome back{props.user.name ? ', ' + props.user.name : ''}</h2>
                <p className="dash-subtitle">
                    {props.user.role === 'teacher'
                        ? 'Manage your classrooms and stay connected with your students.'
                        : 'Here are the classrooms you’re part of.'}
                </p>
            </div>

            {props.user.role === 'teacher' && (
                <div className="card glass-card">
                    <h3><span className="card-icon">➕</span> Create a Classroom</h3>
                    <form className="form-row" onSubmit={createClassroom}>
                        <input placeholder="Class name (e.g. Physics 10A)" value={name} onChange={function (e) { setName(e.target.value); }} required />
                        <input placeholder="Section" value={section} onChange={function (e) { setSection(e.target.value); }} />
                        <button className="btn btn-primary" type="submit">Create</button>
                    </form>
                </div>
            )}

            {props.user.role === 'student' && (
                <div className="card glass-card">
                    <h3><span className="card-icon">🔑</span> Join a Classroom</h3>
                    <form className="form-row" onSubmit={joinClassroom}>
                        <input placeholder="Enter class code" value={code} onChange={function (e) { setCode(e.target.value); }} required />
                        <button className="btn btn-primary" type="submit">Join</button>
                    </form>
                </div>
            )}

            {error && (
                <div className="alert-error">
                    <span>⚠️</span> {error}
                </div>
            )}

            <h3 className="section-title">Your Classrooms</h3>

            {loading ? (
                <div className="loading-wrap">
                    <div className="spinner"></div>
                    <p>Loading classrooms…</p>
                </div>
            ) : (
                <div className="classroom-grid">
                    {classrooms.map(function (c) {
                        return (
                            <div className="classroom-card" key={c.id} onClick={function () { props.onOpenClassroom(c); }}>
                                <div className="classroom-banner" style={{ background: getGradient(c.name || '') }}>
                                    <span className="classroom-emoji">📘</span>
                                </div>
                                <div className="classroom-body">
                                    <h4>{c.name}</h4>
                                    {c.section && <span className="section-tag">{c.section}</span>}
                                    <div className="teacher-row">
                                        <span className="avatar-badge">{getInitials(c.teacherName)}</span>
                                        <span className="teacher-name">{c.teacherName}</span>
                                    </div>
                                    {props.user.role === 'teacher' && (
                                        <div className="classcode-row">
                                            <span className="classcode-badge">🔖 {c.classCode}</span>
                                            <button
                                                className="copy-btn"
                                                title="Copy class code"
                                                onClick={function (e) { handleCopy(e, c.classCode); }}
                                            >📋</button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {classrooms.length === 0 && (
                        <div className="empty-hint">
                            <div className="empty-icon">🗂️</div>
                            <p>No classrooms yet.</p>
                            <span>
                                {props.user.role === 'teacher'
                                    ? 'Create your first classroom above to get started!'
                                    : 'Join a classroom using a code from your teacher.'}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}