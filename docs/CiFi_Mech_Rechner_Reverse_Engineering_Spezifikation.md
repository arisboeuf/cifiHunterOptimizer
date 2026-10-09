# CiFi Mech-Upgrade-Rechner: Reverse-Engineering-Dossier und Implementierungsspezifikation

> Stand: 2026-10-09. Zweck: vollständige Übergabe an eine AI-basierte IDE. **Wichtig:** Die originalen Kostenformeln konnten aus der kompilierten Helper-DLL in dieser Umgebung **noch nicht dekompiliert** werden. Dieses Dokument unterscheidet explizit zwischen nachgewiesenen Feldern, Screenshot-Werten, mathematischen Modellen und offenen Fragen. Keine geratenen Kostenexponenten als Fakten verwenden.

## 1. Primärquellen und Herkunft

- Vom Nutzer bereitgestellte ZIP: `Cifi Ouroboros Helper v0.03.02.zip` (ca. 41 MB). SHA-256: `da195398aebe9e2e09fbc376417127fa7b1b315cdbbace4f6cc36bbb277c9fbb`.
- Darin: `Cifi Ouroboros Helper_Data/Managed/Assembly-CSharp.dll` (100864 Bytes), Unity/C# Mono-Build. ZIP enthält unter anderem `Cifi Ouroboros Helper.exe`, `UnityPlayer.dll` und `*_Data/`.
- Die folgenden Namen sind durch die Zeichenketten der echten DLL belegt: `MechData`, `MechController`, `MechWeights`, `CalculateNextUnitCost`, `CalculateMultiCost`, `CalculateTimerCost`, `CalculateTimer`, `unitCostBase`, `unitCostMultiplier`, `multiCostBase`, `multiCostMultiplier`, `timerCostBase`, `timerCostExponent`, `currentTimerLevel`, `newTimerLevel`, `maxTimerLevel`, `UI_unitCost`, `UI_multiCost`, `UI_timerCost`.
- Die Existenz dieser Symbole beweist **nicht** die konkrete Formel, die Werte der Parameter, ihre Typen oder ob der Helper mit der heutigen Spielversion übereinstimmt.
- Vom Nutzer übermittelte Screenshots vom 2026-10-09: `Screenshot_20261009_080442_CIFI.jpg`, `19412.jpg`, `19414.jpg` bis `19417.jpg`. In den Screenshots angezeigte Werte sind gerundet (`k`, `m`), deshalb sind Preisvergleiche auf die Anzeigepräzision begrenzt.

## 2. Screenshot-Baseline (exakt abgelesene Anzeigewerte)

| Mech | Output | Units | Angezeigter Missionsmultiplikator | Multi pro Mech | Missionsdauer | Timer-Upgrade | Timer-Kosten | Multi-Upgrade pro Mech | Multi-Kosten | Unit-Kosten |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Cradler MK1 | Cells | 16 | 4.506 | 0.216 | 282 min | −2 min | 2,450 | +0.027 | 56,420 | 36,430 |
| Zag MK1 | Mod Points | 10 | 2.340 | 0.130 | 549 min | −3 min | 8,880 | +0.026 | 254,800 | 102,400 |
| Demshah MK1 | Shards | 3 | 1.078 | 0.016 | 720 min | −4 min | 20,000 | +0.016 | 100,000 | 160,000 |
| Tech-Up (Name im Ausschnitt abgeschnitten) | Software Tech | 2 | 1.066 | 0.018 | 960 min | −5 min | 300,000 | +0.018 | 500,000 | 200,000 |
| Token MK1 | Tokens (additiv) | 2 | kein Multiplikator | +10,000 Tokens/Mech | 1440 min | −10 min | 100,000 | +10,000 Tokens/Mech | 800,000 | 324,000 |

**Hinweis zu Tech-Up:** Die Identifikation basiert auf Output und früherer Unterhaltung; der Name ist im Screenshot oben verdeckt. Vor Verwendung im UI gegen das Spiel validieren.

**Wichtig zu den Multi-Werten:** Beim Kauf von `+0.027` für Cradler erhöht sich die Ausgabe bei 16 Units modellhaft um `16 * 0.027 = 0.432`, nicht bloß um 0.027. Die angezeigten Gesamtmultiplikatoren enthalten offenbar Basis-/andere Boni: z.B. Cradler `4.506 != 16 * 0.216`. Daher stets den *angezeigten* Multiplikator als Ausgangspunkt verwenden und nur den Upgrade-Differenzwert addieren. Nicht blind `M = Units * multiPerMech` setzen.

## 3. Drei Upgrade-Operationen

1. **Unit**: `newUnits = units + 1`; für multiplikative Mechs vorläufig `newMissionMultiplier = missionMultiplier + multiPerMech`; Timer unverändert. Bei Tokens `newTokensPerMission = oldTokensPerMission + tokensPerMech`.
2. **Multi**: `newMultiPerMech = multiPerMech + multiUpgradeIncrement`; für multiplikative Mechs `newMissionMultiplier = missionMultiplier + units * multiUpgradeIncrement`; Timer unverändert. Bei Tokens `newTokensPerMission = oldTokensPerMission + units * tokenMultiIncrement`.
3. **Timer**: `newTimerMinutes = timerMinutes - timerReductionMinutes`; sonstige Größen unverändert.

Die obigen **Wirkungsformeln sind Arbeitsannahmen**, die mit angezeigten Spielwerten plausibel sind. Sie sind **nicht** durch den dekompilierten Helper bestätigt.

## 4. Tagesmetriken: exakt definieren, bevor optimiert wird

### 4.1 Kontinuierliches Multiplikationsmodell (theoretische Wachstumsrate)

Für einen Mech mit Multiplikator `M > 0`, Missionsdauer `T` Minuten und 1440 Minuten/Tag:

```text
missionsPerDay = 1440 / T
logDailyFactor = missionsPerDay * ln(M)
dailyFactor = exp(logDailyFactor)
newLogDailyFactor = 1440 / newT * ln(newM)
relativeDailyFactorGain = expm1(newLogDailyFactor - logDailyFactor)
percentGain = 100 * relativeDailyFactorGain
percentGainPerEmerald = percentGain / cost
logGrowthGainPerEmerald = (newLogDailyFactor - logDailyFactor) / cost
```

`percentGainPerEmerald` ist die vom Nutzer gewünschte Kennzahl (Prozentpunkte relativer Tagesfaktor pro 1 Emerald). Für langfristige Sequenzen eignet sich `logGrowthGainPerEmerald` mathematisch besser, da Log-Wachstumsraten additiv sind. **Beide Kennzahlen sind zu berechnen und separat anzuzeigen.**

**Caveat:** `M^(1440/T)` interpoliert Bruchteile einer Mission und ist eine asymptotische Wachstumsrate, nicht die tatsächliche Zahl von abgeschlossenen Missionen innerhalb des nächsten Kalendertages. Die Outputs haben zudem Caps und ggf. weitere Spielmechaniken.

### 4.2 Diskretes 24-Stunden-Modell

Mit Restlaufzeit `R` der aktuellen Mission, Missionsdauer `T` und Horizon `H=1440`:

```text
if H < R: completed = 0
else: completed = 1 + floor((H - R) / T)
```

Beim Upgrade **während** einer laufenden Mission ist unbekannt, ob die aktuelle Mission den neuen Timer/Multiplikator sofort übernimmt. Diese Regel muss am Spiel getestet werden. Bei sofortigem Neustart `completed=floor(H/T)`. Bei diskretem Multiplikator `dailyFactor = M^completed`. Dieses Modell benötigt Mission-Restzeit und genaue Spielregeln.

### 4.3 Token-Unit: additive statt multiplikative Metrik

```text
tokensPerDay = tokensPerMission * 1440 / timerMinutes
extraTokensPerDayPerEmerald = (newTokensPerDay - oldTokensPerDay) / cost
```

Nicht `M^(1440/T)` für Tokens verwenden. Token/Tag/Emerald ist nicht ohne Ressourcenbewertung mit Cells-Prozent/Emerald vergleichbar.

## 5. Reproduzierbare Baseline-Ergebnisse (kontinuierliches Modell)

Die nachstehenden Ergebnisse sind **eigene Modellrechnungen aus den Screenshots, keine Testergebnisse der Helper-DLL**. Formel: `100*expm1(1440/newT*ln(newM)-1440/T*ln(M))/cost`.

| Rang nach %-Zuwachs/Emerald | Mech | Upgrade | Kosten | Neuer Multi | Neuer Timer (min) | Mehr Tagesfaktor (%) | %-Zuwachs pro Emerald |
|---:|---|---|---:|---:|---:|---:|---:|
| 1 | Cradler | Timer | 2,450 | 4.506 | 280 | 5.644402 | 0.0023038373 |
| 2 | Cradler | Multi | 56,420 | 4.938 | 282 | 59.598670 | 0.0010563394 |
| 3 | Cradler | Unit | 36,430 | 4.722 | 282 | 27.009806 | 0.0007414166 |
| 4 | Zag | Unit | 102,400 | 2.470 | 549 | 15.236420 | 0.0001487932 |
| 5 | Zag | Timer | 8,880 | 2.340 | 546 | 1.232759 | 0.0001388242 |
| 6 | Zag | Multi | 254,800 | 2.600 | 549 | 31.831638 | 0.0001249279 |
| 7 | Demshah | Multi | 100,000 | 1.126 | 720 | 9.103645 | 0.0000910364 |
| 8 | Demshah | Unit | 160,000 | 1.094 | 720 | 2.990489 | 0.0000186906 |
| 9 | Tech-Up | Unit | 200,000 | 1.084 | 960 | 2.543495 | 0.0000127175 |
| 10 | Tech-Up | Multi | 500,000 | 1.102 | 960 | 5.108197 | 0.0000102164 |
| 11 | Demshah | Timer | 20,000 | 1.078 | 716 | 0.083954 | 0.0000041977 |
| 12 | Tech-Up | Timer | 300,000 | 1.066 | 955 | 0.050206 | 0.0000001674 |

### Token-Unit-Rechnung

Ausgang: `20,000 Tokens/Mission`, `1440 min`, daher `20,000 Tokens/Tag`.

| Kauf | Tokens/Tag danach | Delta Tokens/Tag | Kosten | Delta Tokens/Tag/Emerald |
|---|---:|---:|---:|---:|
| Timer −10 min | 20,139.86014 | 139.86014 | 100,000 | 0.0013986014 |
| Multi +10k pro Mech (2 Mechs) | 40,000 | 20,000 | 800,000 | 0.025 |
| Unit +1 | 30,000 | 10,000 | 324,000 | 0.0308641975 |

**Wichtig:** `Total Tokens Harvested 60,00k` ist ein kumulierter Stand, nicht Tokens pro Mission. `+20,00k` ist die relevante Missionsausgabe.

## 6. Kostenformeln: tatsächlicher Reverse-Engineering-Status

**Aus der ZIP sicher nachgewiesen:** Der Helper enthält `CalculateNextUnitCost`, `CalculateMultiCost`, `CalculateTimerCost` und die Felder `unitCostBase`, `unitCostMultiplier`, `multiCostBase`, `multiCostMultiplier`, `timerCostBase`, `timerCostExponent`. **Nicht nachgewiesen:** die Rechenoperatoren, genaue Konstanten, Rundungsregeln, Preissteigerungsstufen, Level-Zuordnung und die aktuelle Kompatibilität.

Folgende Signaturen sind **nur gewünschte Schnittstellen, NICHT originale DLL-Signaturen**:

```ts
type MechId = 'cradler' | 'zag' | 'demshah' | 'techUp' | 'token';
type UpgradeKind = 'unit' | 'multi' | 'timer';
type CostStatus = 'verified-from-il' | 'inferred-from-observations' | 'unknown';
interface CostResult { value: number | null; status: CostStatus; notes: string[]; }
function unitCost(mech: MechId, ownedUnits: number): CostResult;
function multiCost(mech: MechId, multiLevel: number): CostResult;
function timerCost(mech: MechId, timerLevel: number): CostResult;
```

### 6.1 Priorität für die IDE: echte IL-Dekompilierung

1. Die ZIP lokal entpacken und `Assembly-CSharp.dll` in **ILSpy** oder **dnSpyEx** öffnen (nur lokal, keine unbekannten EXEs ausführen).
2. Nach `MechController`, `MechData`, `CalculateNextUnitCost`, `CalculateMultiCost`, `CalculateTimerCost` suchen. Vollständige C#-Methoden mit Parametertypen und Aufrufstellen extrahieren.
3. `MechData`-Instanzen/ScriptableObjects aus Unity-Assets mit **AssetRipper** oder **AssetStudio** auslesen, falls Parameter nicht in C# hardcodiert sind. Hierzu `globalgamemanagers.assets`, `level0` und weitere Datencontainer untersuchen.
4. Insbesondere ermitteln: Preisbasis, Preisfaktor, Potenzen, Offsets, Levelindex (0- oder 1-basiert), Rabattfaktoren, Rundung/Formatierung, Limits, Reihenfolge der Berechnung.
5. C#-Formeln 1:1 in TypeScript übertragen. Nicht einfach exponentielle Progression aus Feldnamen raten.
6. Versionsdatum beachten: Dateien im ZIP sind teilweise von Dezember 2024. Änderungen seitdem müssen mit Live-Screenshots überprüft werden.
7. Für **jeden** der 15 aktuellen Upgradepreise Testfälle anlegen; wegen Anzeigeformat `k` Toleranz gemäß UI-Rundung erlauben.

### 6.2 Was bislang tatsächlich getestet wurde

- ZIP-Inhaltsverzeichnis gelesen; `Assembly-CSharp.dll` extrahiert.
- Die oben genannten Methodennamen und Feldnamen per Binär-Stringanalyse gefunden.
- Kein funktionsfähiger .NET-Decompiler im Ausführungscontainer vorhanden; Nachinstallation wegen nicht erreichbarer Paketquelle fehlgeschlagen.
- **Kein ausführbarer Test gegen `CalculateNextUnitCost` / `CalculateMultiCost` / `CalculateTimerCost` erfolgt.** Die Screenshot-Kosten sind Beobachtungen, kein Beweis für die internen Formeln.

## 7. Teststrategie für zukünftige Preisstufen

Für jeden Mech und Upgrade-Typ mindestens drei aufeinanderfolgende Kosten erfassen: `C(level)`, `C(level+1)`, `C(level+2)`.

- Geometrische Progression prüfen: `C1/C0 ≈ C2/C1`. Erst nach drei Punkten einen konstanten Faktor annehmen.
- Potenz-/Polynommodelle und Rundung getrennt testen.
- Level-Sprünge, Min-/Max-Zeiten und nichtlineare Kostenanstiege berücksichtigen.
- Aus einem einzigen Screenshotpreis kann die nächste Kostenstufe **nicht eindeutig** rekonstruiert werden.
- Bei jeder UI-Eingabe exakte Rohwerte bevorzugen, Anzeige `k` ist gerundet.

## 8. Anforderungen an den eigenen Rechner

- Eingabe: Mech, Units, Missionsmultiplikator bzw. Tokens/Mission, Multi pro Mech, aktuelle Missionsdauer, drei aktuelle Preise, Multi-Schritt, Timer-Schritt, optional Restlaufzeit und Caps.
- Drei Vergleichsoptionen: `unit`, `multi`, `timer`.
- Ausgabe pro Option: Preis, neue Werte, Missionen/Tag, theoretischer Tagesfaktor, relativer Tageszuwachs, Zuwachs **pro 1 Emerald**, logarithmischer Tageszuwachs/Emerald, optional diskrete 24h-Prognose.
- Ressourcentypen separat halten (Cells, MP, Shards, Tech, Tokens); keine numerische Ressourcen-übergreifende Priorität ohne Gewichte/Umrechnung.
- Kostenquelle sichtbar machen: `Live-Screenshot`, `Helper-IL-verifiziert`, `geschätzt` oder `unbekannt`.
- Mehrkauf-Optimierer erst aktivieren, wenn die **nächsten** Kosten nach jedem simulierten Kauf berechenbar und getestet sind. Nach jedem Kauf Zustand und Kosten neu berechnen; keine statischen Rankings mehrfach anwenden.
- Cap-Modell, Offline-Fortschritt und bereits laufende Missionen konfigurierbar machen.
- Unit-/Multi-Boni ggf. andere Effekte haben als additive Anzeigeannahme: Test mit echtem Spielwert vor/nach Kauf.

## 9. Beispielimplementierung TypeScript: sichere Wachstumsberechnung

```ts
interface MultiplierMech {
  units: number;
  missionMultiplier: number;
  multiPerMech: number;
  timerMinutes: number;
  timerReductionMinutes: number;
  multiUpgradeIncrement: number;
  costs: { unit: number; multi: number; timer: number };
}

type Kind = 'unit' | 'multi' | 'timer';

function modelUpgrade(s: MultiplierMech, kind: Kind) {
  let newM = s.missionMultiplier;
  let newT = s.timerMinutes;
  if (kind === 'unit') newM += s.multiPerMech;
  if (kind === 'multi') newM += s.units * s.multiUpgradeIncrement;
  if (kind === 'timer') newT -= s.timerReductionMinutes;
  if (s.missionMultiplier <= 0 || newM <= 0 || newT <= 0 || s.timerMinutes <= 0) {
    throw new Error('Invalid multiplier or timer');
  }
  const oldLog = 1440 / s.timerMinutes * Math.log(s.missionMultiplier);
  const newLog = 1440 / newT * Math.log(newM);
  const deltaLog = newLog - oldLog;
  const cost = s.costs[kind];
  if (!(cost > 0)) throw new Error('Invalid cost');
  const pct = 100 * Math.expm1(deltaLog);
  return {
    kind, cost, newMissionMultiplier: newM, newTimerMinutes: newT,
    missionsPerDay: 1440 / newT,
    percentDailyFactorGain: pct,
    percentDailyFactorGainPerEmerald: pct / cost,
    logDailyGrowthGainPerEmerald: deltaLog / cost,
  };
}
```

### Test-Fixtures

```ts
const cradler = {
  units: 16, missionMultiplier: 4.506, multiPerMech: 0.216,
  timerMinutes: 282, timerReductionMinutes: 2,
  multiUpgradeIncrement: 0.027,
  costs: { unit: 36430, multi: 56420, timer: 2450 }
};
// Unit -> M=4.722; Multi -> M=4.938; Timer -> T=280.
// Alle Prozentwerte mit Formel aus Abschnitt 4.1 überprüfen.
```

## 10. Offene Punkte (keine Scheinsicherheit)

- Exakte Kostenfunktionen/Parameter **noch nicht aus IL extrahiert**.
- Kein direkter Lauf des Helpers oder Vergleich seiner tatsächlichen Kosten-Ausgaben erfolgt.
- Kosten möglicherweise durch Prestige, Shop-Boni, Trinkets, Gem-Upgrades oder andere globale Modifikatoren beeinflusst.
- Multi-/Unit-Anzeige könnte gerundet sein, wodurch geringe Abweichungen zu erwarten sind.
- Tageswachstumsmodell kann vom realen Fortschritt wegen Caps, Mission-Handling und Offline-Regeln abweichen.
- Alter des Helper-Builds: Daten und Formeln können inzwischen geändert worden sein.

## 11. Klare nächste Aufgabe für die AI-IDE

**Arbeite zunächst NICHT an einer hübschen Oberfläche.** Dekompiliere die drei echten `Calculate*Cost`-Methoden aus `Assembly-CSharp.dll`, finde die Mech-Parameter in Code oder Unity-Assets, dokumentiere Originalformel und Konstanten je Mech, implementiere sie in TypeScript und validiere alle 15 Preise aus Abschnitt 2. Gib für jede Abweichung den Betrag, Rundungstoleranz und mögliche Versionsursache aus. Erst danach Mehrkauf-Optimierung und UI bauen.
