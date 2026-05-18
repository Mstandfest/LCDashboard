function parseRaidString(input) {
    const parts = input.split('^');
    const raidHeader = parts[0].split('|'); 
    const playerPart = parts[1]; 
    const attendancePart = parts[2]; 
    const lootPart = parts[3];

    // 1. Spieler parsen
    const playerEntries = playerPart.split(',').map(entry => {
        const [name, className] = entry.split(':');
        return { 
            name: name ? name.trim() : 'Unknown', 
            className: className ? className.trim() : 'Unknown' 
        };
    });

    // 2. Attendance parsen
    const attendanceMap = {};
    attendancePart.split(';').forEach(bossGroup => {
        const [bossId, playerIndices] = bossGroup.split(':');
        playerIndices.split(',').forEach(idx => {
            const player = playerEntries[parseInt(idx)];
            if (player) {
                attendanceMap[player.name] = (attendanceMap[player.name] || 0) + 1;
            }
        });
    });

    // 3. Loot parsen
    const lootEntries = [];
    if (lootPart && lootPart.trim() !== "") {
        lootPart.split(';').forEach(loot => {
            const [itemId, playerIdx] = loot.split(':');
            const winner = playerEntries[parseInt(playerIdx)];
            if (winner) {
                lootEntries.push({ 
                    itemId: itemId.trim(), 
                    winner: winner.name 
                });
            }
        });
    }

    return {
        raidData: {
            instance: raidHeader[0],
            date: new Date(parseInt(raidHeader[1]) * 1000).toISOString().slice(0, 19).replace('T', ' '),
            totalBosses: parseInt(raidHeader[2])
        },
        players: playerEntries,
        attendance: attendanceMap,
        loot: lootEntries
    };
}

module.exports = { parseRaidString };
