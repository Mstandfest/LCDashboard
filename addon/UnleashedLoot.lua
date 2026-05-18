local addonName, addonTable = ...
-- DB Initialisierung
UnleashedLootDB = UnleashedLootDB or { raids = {}, players = {}, currentRaid = nil }

local frame = CreateFrame("Frame")
frame:RegisterEvent("ENCOUNTER_END")
frame:RegisterEvent("CHAT_MSG_LOOT")
frame:RegisterEvent("ADDON_LOADED")

local function GetPlayerIndex(name)
    if not UnleashedLootDB.currentRaid or not name then return nil end
    for i, p in ipairs(UnleashedLootDB.currentRaid.players) do
        if p.name == name then return i - 1 end
    end
    
    local _, classFilename = UnitClass(name)
    table.insert(UnleashedLootDB.currentRaid.players, { name = name, class = classFilename or "Unknown" })
    return #UnleashedLootDB.currentRaid.players - 1
end

frame:SetScript("OnEvent", function(self, event, ...)
    if event == "ADDON_LOADED" and ... == addonName then
        print("|cff00ff00UnleashedLoot geladen! Nutze /unleashed zum Export.|r")
    
    elseif event == "ENCOUNTER_END" then
        local encounterID, encounterName, difficultyID, groupSize, success = ...
        if success == 1 then
            if not UnleashedLootDB.currentRaid then
                UnleashedLootDB.currentRaid = {
                    instance = GetRealZoneText(),
                    timestamp = time(),
                    players = {},
                    bosses = {},
                    loot = {}
                }
            end

            local presentIndices = {}
            for i = 1, GetNumGroupMembers() do
                local name = GetRaidRosterInfo(i)
                if name then table.insert(presentIndices, GetPlayerIndex(name)) end
            end
            
            table.insert(UnleashedLootDB.currentRaid.bosses, {
                name = encounterName,
                indices = presentIndices
            })
            print("|cff00ff00Boss registriert: " .. encounterName .. "|r")
        end

    elseif event == "CHAT_MSG_LOOT" then
        local lootMsg, _, _, _, playerName = ...
        if UnleashedLootDB.currentRaid and lootMsg and playerName then
            local itemID = lootMsg:match("Hitem:(%d+)")
            if itemID then
                local name = playerName:match("([^%-]+)")
                local pIdx = GetPlayerIndex(name)
                if pIdx then
                    table.insert(UnleashedLootDB.currentRaid.loot, itemID .. ":" .. pIdx)
                end
            end
        end
    end
end)

local function ShowExportWindow()
    if not UnleashedLootDB.currentRaid then 
        print("|cffff0000Keine Raid-Daten! (Erst nach einem Bosskill verfügbar)|r")
        return 
    end

    local r = UnleashedLootDB.currentRaid
    local export = r.instance .. "|" .. r.timestamp .. "|" .. #r.bosses .. "^"
    
    local pList = {}
    for _, p in ipairs(r.players) do table.insert(pList, p.name .. ":" .. p.class) end
    export = export .. table.concat(pList, ",") .. "^"
    
    local bList = {}
    for i, b in ipairs(r.bosses) do
        table.insert(bList, "B" .. i .. ":" .. table.concat(b.indices, ","))
    end
    export = export .. table.concat(bList, ";") .. "^"
    export = export .. table.concat(r.loot, ";")

    -- UI
    if UnleashedExportFrame then UnleashedExportFrame:Hide() end
    local f = CreateFrame("Frame", "UnleashedExportFrame", UIParent, "BasicFrameTemplateWithInset")
    f:SetSize(350, 280)
    f:SetPoint("CENTER")
    f:SetMovable(true)
    f:EnableMouse(true)
    f:RegisterForDrag("LeftButton")
    f:SetScript("OnDragStart", f.StartMoving)
    f:SetScript("OnDragStop", f.StopMovingOrSizing)
    
    f.title = f:CreateFontString(nil, "OVERLAY")
    f.title:SetFontObject("GameFontHighlight")
    f.title:SetPoint("CENTER", f.TitleBg, "CENTER", 0, 0)
    f.title:SetText("Unleashed Export (Strg+C)")

    local eb = CreateFrame("EditBox", nil, f)
    eb:SetMultiLine(true)
    eb:SetFontObject("ChatFontNormal")
    eb:SetSize(300, 180)
    eb:SetPoint("TOP", 0, -40)
    eb:SetText(export)
    eb:HighlightText()
    eb:SetFocus()
    eb:SetScript("OnEscapePressed", function() f:Hide() end)
    
    local btn = CreateFrame("Button", nil, f, "GameMenuButtonTemplate")
    btn:SetPoint("BOTTOM", 0, 15)
    btn:SetSize(140, 25)
    btn:SetText("Daten löschen")
    btn:SetScript("OnClick", function() 
        UnleashedLootDB.currentRaid = nil 
        print("|cffff0000Daten gelöscht.|r")
        f:Hide()
    end)
    f:Show()
end

SLASH_UNLEASHED1 = "/unleashed"
SlashCmdList["UNLEASHED"] = ShowExportWindow

-- Test mit /unleashedtest um Teststring zu erzeugen
local function TestRaidExport()
    print("|cffffff00Simuliere Raid-Daten für Test...|r")
    
    -- 1. Datenbank initialisieren (analog zu ENCOUNTER_END)
    UnleashedLootDB.currentRaid = {
        instance = "Test-Instanz (Karamazov)",
        timestamp = time(),
        players = {},
        bosses = {},
        loot = {}
    }

    -- 2. Test-Spieler
    local testPlayers = {
        { name = "Arthas", class = "WARRIOR" },
        { name = "Jaina", class = "MAGE" },
        { name = "Uther", class = "PALADIN" }
    }

    for _, p in ipairs(testPlayers) do
        table.insert(UnleashedLootDB.currentRaid.players, { name = p.name, class = p.class })
    end

    -- 3. Bosskill simulieren
    table.insert(UnleashedLootDB.currentRaid.bosses, {
        name = "Test-Boss 1",
        indices = {0, 1, 2}
    })

    -- 4. Loot simulieren
    table.insert(UnleashedLootDB.currentRaid.loot, "30108:0")
    
    print("|cff00ff00Test-Daten generiert! Nutze jetzt /unleashed zum Export.|r")
end

-- Slash-Kommando für den Test
SLASH_UNLEASHEDTEST1 = "/unleashedtest"
SlashCmdList["UNLEASHEDTEST"] = TestRaidExport