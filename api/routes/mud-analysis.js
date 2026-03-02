const express = require('express');
const router = express.Router();

let wellsCache = null;
let wellsCacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000;

// Normalize section names to standard groups
function normSection(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (n.includes('surface')) return 'Surface';
  if (n.includes('intermediate')) return 'Intermediate';
  if (n.includes('main') || n.includes('horizontal')) return 'Main Hole';
  if (n.includes('top hole')) return 'Top Hole';
  if (n.includes('pilot')) return 'Pilot';
  if (n.includes('completion')) return 'Completions';
  return name;
}

/**
 * GET /api/mud-analysis/wells
 * Queries EnerTrax data from drilling_fluids database
 */
router.get('/wells', async (req, res) => {
  try {
    if (wellsCache && Date.now() - wellsCacheTime < CACHE_DURATION) {
      return res.json(wellsCache);
    }

    const fdb = req.fluidsDb;

    // 1. Fetch all wells
    const rawWells = await fdb.collection('wells').find({}, {
      projection: {
        UIDWell: 1, WellName: 1, RigName: 1, OperatorName: 1,
        LicenseNo: 1, licence_number: 1, SpudDate: 1, ReleaseDate: 1,
        FieldName: 1, TargetFormation: 1, TotalWellCost: 1, Dollarperm: 1,
      }
    }).toArray();

    // 2. Fetch all sections (5.7K docs — small enough to process in JS)
    const allSections = await fdb.collection('sections').find({}, {
      projection: { licence_number: 1, SectionName: 1, TotalSectionCost: 1, TotalSectionLosses: 1, HoleDepth: 1, SectionLength: 1, Dollarperm: 1, UIDSection: 1 }
    }).toArray();

    // Build per-well section map with totals AND per-section breakdown
    const sectionMap = {};
    allSections.forEach(s => {
      const lic = s.licence_number;
      if (!lic) return;
      if (!sectionMap[lic]) sectionMap[lic] = { sections: new Set(), totalCost: 0, totalLoss: 0, maxDepth: 0, sectionCount: 0, bySection: {}, sectionUids: {} };
      const entry = sectionMap[lic];
      const name = s.SectionName;
      if (name) entry.sections.add(name);
      entry.totalCost += (s.TotalSectionCost || 0);
      entry.totalLoss += (s.TotalSectionLosses || 0);
      entry.maxDepth = Math.max(entry.maxDepth, s.HoleDepth || 0);
      entry.sectionCount++;
      // Per-section detail (normalized name → {cost, loss, depth})
      const norm = normSection(name);
      if (norm) {
        if (!entry.bySection[norm]) entry.bySection[norm] = { cost: 0, loss: 0, depth: 0, length: 0, costPerM: 0, uids: [] };
        const bs = entry.bySection[norm];
        bs.cost += (s.TotalSectionCost || 0);
        bs.loss += (s.TotalSectionLosses || 0);
        bs.depth = Math.max(bs.depth, s.HoleDepth || 0);
        bs.length += (s.SectionLength || 0);
        if (s.UIDSection) bs.uids.push(s.UIDSection);
      }
    });
    // Convert sets to arrays and compute costPerM
    Object.values(sectionMap).forEach(entry => {
      entry.sections = [...entry.sections];
      Object.values(entry.bySection).forEach(bs => {
        bs.costPerM = bs.length > 0 ? Math.round(bs.cost / bs.length * 100) / 100 : null;
      });
    });

    // 3. Aggregate mud checks by licence_number (avg mud properties)
    const mudAgg = await fdb.collection('mud_checks').aggregate([
      {
        $group: {
          _id: '$licence_number',
          checks: { $sum: 1 },
          avgDensity: { $avg: '$Density' },
          avgPV: { $avg: '$Plastic_Viscosity' },
          avgYP: { $avg: '$Yield_Point' },
          avgPH: { $avg: '$pH' },
          avgFunnelVis: { $avg: '$Viscosity' },
        }
      }
    ]).toArray();
    const mudMap = {};
    mudAgg.forEach(m => { mudMap[m._id] = m; });

    // 4. Aggregate mud reports by licence_number (losses, mud types)
    const reportAgg = await fdb.collection('mud_reports').aggregate([
      {
        $group: {
          _id: '$licence_number',
          reports: { $sum: 1 },
          totalLosses: { $sum: '$TotalLosses' },
          mudTypes: { $addToSet: '$MudTypeName' },
          minDate: { $min: '$MRDate' },
          maxDate: { $max: '$MRDate' },
        }
      }
    ]).toArray();
    const reportMap = {};
    reportAgg.forEach(r => { reportMap[r._id] = r; });

    // 5. Aggregate product costs by licence_number
    const costAgg = await fdb.collection('products').aggregate([
      {
        $group: {
          _id: '$licence_number',
          totalProductCost: { $sum: '$Cost' },
          productCount: { $sum: 1 },
        }
      }
    ]).toArray();
    const costMap = {};
    costAgg.forEach(c => { costMap[c._id] = c; });

    // Build wells array
    const rigSet = new Set();
    const operatorSet = new Set();
    const fieldSet = new Set();
    const formationSet = new Set();


    const wells = rawWells.map((w, i) => {
      const lic = w.licence_number || w.LicenseNo || null;
      const sec = sectionMap[lic] || {};
      const mud = mudMap[lic] || {};
      const rep = reportMap[lic] || {};
      const cost = costMap[lic] || {};

      const rig = w.RigName || null;
      const operator = w.OperatorName || null;
      const field = w.FieldName || null;
      const formation = w.TargetFormation || null;

      if (rig) rigSet.add(rig);
      if (operator) operatorSet.add(operator);
      if (field) fieldSet.add(field);
      if (formation) formationSet.add(formation);

      // Normalize section names
      const rawSections = (sec.sections || []).filter(Boolean);
      const normSections = [...new Set(rawSections.map(normSection).filter(Boolean))];
      // Sort: Surface → Top Hole → Intermediate → Main Hole → others
      const secOrder = { 'Surface': 0, 'Top Hole': 1, 'Intermediate': 2, 'Main Hole': 3, 'Pilot': 4, 'Completions': 5 };
      normSections.sort((a, b) => (secOrder[a] ?? 99) - (secOrder[b] ?? 99));

      const spudDate = w.SpudDate ? new Date(w.SpudDate) : null;
      const year = spudDate ? spudDate.getFullYear() : null;

      // Mud types
      const mudTypes = (rep.mudTypes || []).filter(Boolean);

      return {
        id: i,
        wellName: w.WellName,
        rig,
        operator,
        licence: lic,
        field,
        formation,
        sections: normSections,
        sectionCount: sec.sectionCount || 0,
        mudTypes,
        // Dates
        spudDate: w.SpudDate,
        releaseDate: w.ReleaseDate,
        minDate: rep.minDate || w.SpudDate,
        maxDate: rep.maxDate || w.ReleaseDate,
        year,
        // Costs (well-level totals)
        totalCost: w.TotalWellCost || sec.totalCost || null,
        costPerMeter: w.Dollarperm || null,
        productCost: cost.totalProductCost || null,
        // Depth
        maxDepth: sec.maxDepth || null,
        // Losses
        totalLoss: sec.totalLoss || rep.totalLosses || null,
        // Per-section breakdown (for section-level filtering)
        bySection: Object.fromEntries(
          Object.entries(sec.bySection || {}).map(([k, v]) => [k, {
            cost: v.cost ? Math.round(v.cost) : null,
            loss: v.loss ? Math.round(v.loss * 10) / 10 : null,
            depth: v.depth || null,
            length: v.length || null,
            costPerM: v.costPerM,
          }])
        ),
        // Mud properties (from mud_checks)
        mudChecks: mud.checks || 0,
        avgDensity: mud.avgDensity ? Math.round(mud.avgDensity) : null,
        avgPV: mud.avgPV ? Math.round(mud.avgPV * 10) / 10 : null,
        avgYP: mud.avgYP ? Math.round(mud.avgYP * 10) / 10 : null,
        avgPH: mud.avgPH ? Math.round(mud.avgPH * 10) / 10 : null,
        avgViscosity: mud.avgFunnelVis ? Math.round(mud.avgFunnelVis * 10) / 10 : null,
        // Reports
        mudReports: rep.reports || 0,
        productCount: cost.productCount || 0,
      };
    });

    // Build filter options
    const rigs = [...rigSet].sort();
    const operators = [...operatorSet].sort();
    const fields = [...fieldSet].sort();

    // Year counts
    const yearCounts = {};
    wells.forEach(w => {
      if (w.year) yearCounts[w.year] = (yearCounts[w.year] || 0) + 1;
    });
    const years = Object.keys(yearCounts).map(Number).sort((a, b) => b - a);

    // Section counts (normalized)
    const sectionCounts = {};
    wells.forEach(w => {
      (w.sections || []).forEach(s => { sectionCounts[s] = (sectionCounts[s] || 0) + 1; });
    });
    const sectionList = Object.keys(sectionCounts).sort((a, b) => {
      const order = { 'Surface': 0, 'Top Hole': 1, 'Intermediate': 2, 'Main Hole': 3, 'Pilot': 4, 'Completions': 5 };
      return (order[a] ?? 99) - (order[b] ?? 99);
    });

    wellsCache = {
      wells,
      rigs,
      operators,
      fields,
      years,
      yearCounts,
      sections: sectionList,
      sectionCounts,
      totalWells: wells.length,
      totalMudChecks: wells.reduce((a, w) => a + w.mudChecks, 0),
      lastUpdated: new Date().toISOString(),
    };
    wellsCacheTime = Date.now();

    res.json(wellsCache);
  } catch (error) {
    console.error('Error fetching mud analysis wells:', error);
    res.status(500).json({ error: 'Failed to fetch mud data' });
  }
});

/**
 * GET /api/mud-analysis/summary
 */
router.get('/summary', async (req, res) => {
  try {
    const fdb = req.fluidsDb;

    const [wellCount, sectionStats, mudStats] = await Promise.all([
      fdb.collection('wells').countDocuments(),
      fdb.collection('sections').aggregate([
        {
          $group: {
            _id: null,
            totalCost: { $sum: '$TotalSectionCost' },
            totalLoss: { $sum: '$TotalSectionLosses' },
            avgCostPerMeter: { $avg: '$Dollarperm' },
          }
        }
      ]).toArray(),
      fdb.collection('mud_checks').aggregate([
        {
          $group: {
            _id: null,
            totalChecks: { $sum: 1 },
            avgDensity: { $avg: '$Density' },
            avgPV: { $avg: '$Plastic_Viscosity' },
            avgYP: { $avg: '$Yield_Point' },
          }
        }
      ]).toArray(),
    ]);

    const sec = sectionStats[0] || {};
    const mud = mudStats[0] || {};

    res.json({
      totalWells: wellCount,
      totalMudChecks: mud.totalChecks || 0,
      totalCost: sec.totalCost ? Math.round(sec.totalCost) : 0,
      totalLoss: sec.totalLoss ? Math.round(sec.totalLoss * 10) / 10 : 0,
      avgCostPerMeter: sec.avgCostPerMeter ? Math.round(sec.avgCostPerMeter * 100) / 100 : 0,
      avgDensity: mud.avgDensity ? Math.round(mud.avgDensity) : 0,
      avgPV: mud.avgPV ? Math.round(mud.avgPV * 10) / 10 : 0,
      avgYP: mud.avgYP ? Math.round(mud.avgYP * 10) / 10 : 0,
    });
  } catch (error) {
    console.error('Error fetching mud summary:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

/**
 * GET /api/mud-analysis/well/:licence
 * Detailed data for a single well
 */
router.get('/well/:licence', async (req, res) => {
  try {
    const fdb = req.fluidsDb;
    const licence = decodeURIComponent(req.params.licence);

    const [well, sections, mudChecks, reports, products] = await Promise.all([
      fdb.collection('wells').findOne({ licence_number: licence }),
      fdb.collection('sections').find({ licence_number: licence }).sort({ SectionSequence: 1 }).toArray(),
      fdb.collection('mud_checks').find({ licence_number: licence })
        .project({ _id: 0, MudCheckNo: 1, Density: 1, Viscosity: 1, Plastic_Viscosity: 1, Yield_Point: 1, pH: 1, Measured_Depth: 1, TVD_Depth: 1, Flowline_Temperature: 1, Sand: 1, licence_number: 1 })
        .toArray(),
      fdb.collection('mud_reports').find({ licence_number: licence }).sort({ MRDate: 1 })
        .project({ _id: 0, MRDate: 1, ReportNo: 1, MudTypeName: 1, TotalLosses: 1, MudLosses: 1, SurfaceLosses: 1, RunningCosts: 1, TotalVol: 1, Comments: 1, licence_number: 1 })
        .toArray(),
      fdb.collection('products').find({ licence_number: licence }).sort({ UsageDate: 1 })
        .project({ _id: 0, ProductName: 1, Amount: 1, Cost: 1, UsageDate: 1, ProductFunction: 1, licence_number: 1 })
        .toArray(),
    ]);

    res.json({ well, sections, mudChecks, reports, products });
  } catch (error) {
    console.error('Error fetching well detail:', error);
    res.status(500).json({ error: 'Failed to fetch well detail' });
  }
});

module.exports = router;
