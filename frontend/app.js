const classColors = {
    'WARRIOR': '#c79c6e', 'PALADIN': '#f58cba', 'HUNTER': '#abd473',
    'ROGUE': '#fff569', 'PRIEST': '#ffffff', 'SHAMAN': '#0070de',
    'MAGE': '#3fc7eb', 'WARLOCK': '#8787ed', 'DRUID': '#ff7d0a'
};

document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('attendanceBody')) loadDashboardData();
    if (document.getElementById('importBtn')) initAdminPanel();
});

async function loadDashboardData() {
    try {
        const [attRes, raidRes, lootRes] = await Promise.all([
            fetch('/api/attendance'),
            fetch('/api/raids'),
            fetch('/api/loot')
        ]);

        const attendanceData = await attRes.json();
        const raidData = await raidRes.json();
        const lootData = await lootRes.json();

        // 1. Attendance Tabelle
        document.getElementById('attendanceBody').innerHTML = attendanceData.map(player => `
            <tr>
                <td style="color: ${classColors[player.class] || '#eee'}; font-weight: bold;">${player.name}</td>
                <td>${player.class || '---'}</td>
                <td>${player.attendance_rate}%</td>
                <td>${player.total_attended} / ${player.total_possible}</td>
                <td>${player.attendance_rate >= 80 ? '✅' : '❌'}</td>
            </tr>
        `).join('');

        // 2. Raid Historie
        document.getElementById('raidBody').innerHTML = raidData.map(raid => `
            <tr>
                <td>#${raid.id}</td>
                <td>${raid.instance_name}</td>
                <td>${new Date(raid.raid_date).toLocaleDateString('de-DE')}</td>
                <td>${raid.total_bosses}</td>
            </tr>
        `).join('');

        // 3. Loot Tabelle
        document.getElementById('lootBody').innerHTML = lootData.map(item => `
            <tr>
                <td style="color: ${classColors[item.class] || '#eee'};">${item.name}</td>
                <td>
                    <a href="https://www.wowhead.com/tbc/item=${item.item_id}" 
                       data-wowhead="domain=tbc" target="_blank">[Lade Item...]</a>
                </td>
                <td>${new Date(item.raid_date).toLocaleDateString('de-DE')}</td>
                <td>${item.instance_name}</td>
            </tr>
        `).join('');

        // WoWhead refresh
        refreshWoWhead();

    } catch (err) {
        console.error("Fehler beim Laden der Dashboard-Daten:", err);
    }
}

function refreshWoWhead(versuche = 10) {
    if (window.$WowheadPower) {
        window.$WowheadPower.refreshLinks();
    } else if (versuche > 0) {
        setTimeout(() => refreshWoWhead(versuche - 1), 500);
    }
}

// Admin Post mit Secret-Key
function initAdminPanel() {
    const importBtn = document.getElementById('importBtn');
    if (!importBtn) return;
    importBtn.addEventListener('click', async () => {
        const raidString = document.getElementById('raidString').value;
        const adminToken = document.getElementById('adminToken').value;
        const response = await fetch('/api/admin/ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-admin-token': adminToken },
            body: JSON.stringify({ raidString })
        });
        if (response.ok) alert("Raid importiert!");
    });
}
