import { useState, useEffect, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Client
// Note: You will need to replace these with your actual Supabase URL and Anon Key
const supabaseUrl = "https://thhwhrneubzztqxhqsxn.supabase.co";
const supabaseKey = "sb_publishable_r19Jj2_cO-e1dtLWKjq5cQ_ldmHIAqv";
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── Storage ──────────────────────────────────────────────────────────────────
// ─── Storage — Supabase with localStorage & in-memory fallback ──────────────────────────
const MEM = {};
const debounceTimers = {};

const db = {
  get: async (k) => {
    try {
      // 1. Try to fetch from Supabase
      const { data, error } = await supabase
        .from("kv_store")
        .select("value")
        .eq("key", "forge_" + k)
        .single();
        
      if (data && data.value) return data.value;
      
      // 2. Fallback to localStorage if offline/missing
      const raw = localStorage.getItem("forge_" + k);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return MEM[k] ?? null;
    }
  },
  set: async (k, v) => {
    // 1. Immediate local write for a snappy, fast UI
    try {
      localStorage.setItem("forge_" + k, JSON.stringify(v));
    } catch (e) {
      MEM[k] = v;
    }

    // 2. Debounced Cloud Write (wait 1.5 seconds after last tap before sending to Supabase)
    if (debounceTimers[k]) clearTimeout(debounceTimers[k]);
    debounceTimers[k] = setTimeout(async () => {
      try {
        await supabase
          .from("kv_store")
          .upsert({ key: "forge_" + k, value: v }, { onConflict: 'key' });
      } catch (error) {
        console.error("Supabase sync error:", error);
      }
    }, 1500);
  },
};
const todayStr = () => new Date().toISOString().slice(0, 10);

// ─── Defaults ─────────────────────────────────────────────────────────────────
const emptyProfile = () => ({ name: "Vaikunth", height: 171, weight: 81, targetWeight: 72, age: 32 });
const emptyDay = () => ({ exercises: [], water: 0, meals: [], junk: [], weight: "" });

// ─── Health helpers ───────────────────────────────────────────────────────────
const bmi = (wt, htCm) => htCm > 0 ? (wt / ((htCm / 100) ** 2)).toFixed(1) : "—";
const bmiLabel = (b) => {
  if (b === "—") return { text: "—", col: "#94a3b8" };
  const n = parseFloat(b);
  if (n < 18.5) return { text: "Underweight", col: "#60a5fa" };
  if (n < 25)   return { text: "Normal",      col: "#4ade80" };
  if (n < 30)   return { text: "Overweight",  col: "#fb923c" };
  return           { text: "Obese",         col: "#f87171" };
};
const calToWeight = (net) => (net / 7700).toFixed(3);
const netCalories = (d, workoutBurn) => {
  const gymBurn    = workoutBurn || 0;
  const extraBurn  = (d.exercises || []).reduce((a, e) => a + (parseFloat(e.calBurnt) || 0), 0);
  const eaten      = [...(d.meals || []), ...(d.junk || [])].reduce((a, f) => a + (parseFloat(f.cal) || 0), 0);
  return eaten - gymBurn - extraBurn;
};

// ─── Food / Junk Data ─────────────────────────────────────────────────────────
const FOODS = [
  {name:"Dal Rice (1 plate)",cal:450},{name:"Roti Sabzi (2 roti)",cal:320},{name:"Poha (1 bowl)",cal:250},
  {name:"Upma (1 bowl)",cal:220},{name:"Idli Sambar (3 idli)",cal:280},{name:"Dosa (2 plain)",cal:300},
  {name:"Rajma Rice (1 plate)",cal:480},{name:"Chole Bhature (1 plate)",cal:600},{name:"Paneer Sabzi (100g)",cal:260},
  {name:"Khichdi (1 bowl)",cal:350},{name:"Sabudana Khichdi (1 bowl)",cal:330},{name:"Pav Bhaji (1 plate)",cal:450},
  {name:"Sprout Salad (1 bowl)",cal:120},{name:"Mixed Veg Salad (1 bowl)",cal:80},{name:"Fruit Bowl (1 bowl)",cal:150},
  {name:"Banana (1)",cal:90},{name:"Protein Shake (1 scoop)",cal:130},{name:"Protein Shake (2 scoops)",cal:260},
  {name:"Buttermilk (1 glass)",cal:40},{name:"Lassi (1 glass)",cal:180},{name:"Milk (1 glass)",cal:120},
  {name:"Curd (1 bowl)",cal:100},{name:"Custom...",cal:0},
];
const JUNK = [
  {name:"Chips (small pack)",cal:150},{name:"Chips (large pack)",cal:300},{name:"Biscuits (4 pcs)",cal:200},
  {name:"Chocolate (1 bar)",cal:250},{name:"Cold Drink (1 can)",cal:140},{name:"Samosa (2 pcs)",cal:300},
  {name:"Vada Pav (1)",cal:320},{name:"Pizza (2 slices)",cal:500},{name:"French Fries (medium)",cal:370},
  {name:"Ice Cream (1 scoop)",cal:200},{name:"Custom...",cal:0},
];
const CARDIO_EX = [
  {name:"Running",met:9.8},{name:"Cycling",met:7.5},{name:"Walking",met:3.5},{name:"Jump Rope",met:12},
  {name:"Swimming",met:8},{name:"Elliptical",met:5.5},{name:"Rowing",met:7},{name:"HIIT",met:10},
  {name:"Zumba",met:6.5},{name:"Stair Climbing",met:9},
];
const STRENGTH_EX = [
  "Push-ups","Pull-ups","Squats","Lunges","Deadlift","Bench Press","Overhead Press","Plank",
  "Dumbbell Curls","Tricep Dips","Leg Press","Lat Pulldown","Cable Rows","Shoulder Shrugs","Calf Raises",
];

// ─── Workout Data ─────────────────────────────────────────────────────────────
const MUSCLES = ["chest","back","lats","shoulders","biceps","triceps","quads","hamstrings","glutes","calves","core","cardio"];
const MACHINES = ["Smith Machine","Dumbbells","EZ Curl Bar","Dual Cable Pulley","High Hammer Row","45° Leg Press","Calf Machine","Leg Curl Machine","Stationary Bike","Treadmill","Decline Bench"];

const EXERCISE_LIBRARY = [
  {id:"lib_smc3",name:"Smith Machine Close-Grip Press",machine:"Smith Machine",muscle:"chest",sets:3,reps:"12",weightKg:20,restSec:75,calPerSet:7,note:"Hands 30cm apart. Inner chest + triceps."},
  {id:"lib_dcf", name:"Cable Crossover Fly",           machine:"Dual Cable Pulley",muscle:"chest",sets:3,reps:"15",weightKg:8,restSec:60,calPerSet:6,note:"Arms wide, slight elbow bend. Squeeze centre."},
  {id:"lib_dcp", name:"Decline DB Press",              machine:"Dumbbells + Decline Bench",muscle:"chest",sets:3,reps:"12",weightKg:12,restSec:75,calPerSet:7,note:"Per dumbbell. Lower chest emphasis."},
  {id:"lib_pec", name:"Cable Pec Fly (High to Low)",   machine:"Dual Cable Pulley",muscle:"chest",sets:3,reps:"15",weightKg:10,restSec:60,calPerSet:5,note:"Cables high. Pull down and across."},
  {id:"lib_cpr2",name:"Cable Pullover",                machine:"Dual Cable Pulley",muscle:"lats",sets:3,reps:"15",weightKg:15,restSec:60,calPerSet:6,note:"Stand back to cable. Pull to hips."},
  {id:"lib_dbsh",name:"DB Shrug",                      machine:"Dumbbells",muscle:"back",sets:4,reps:"20",weightKg:20,restSec:45,calPerSet:4,note:"Straight arms. Squeeze traps at top."},
  {id:"lib_hhr2",name:"Hammer Row Iso Hold",           machine:"High Hammer Row",muscle:"back",sets:3,reps:"10+3s hold",weightKg:25,restSec:90,calPerSet:8,note:"Pull and hold 3 seconds each rep."},
  {id:"lib_smlw",name:"Smith Machine Wide Row",        machine:"Smith Machine",muscle:"back",sets:3,reps:"10",weightKg:25,restSec:90,calPerSet:7,note:"Wide grip, pull to upper chest."},
  {id:"lib_cfr", name:"Cable Front Raise",             machine:"Dual Cable Pulley",muscle:"shoulders",sets:3,reps:"15",weightKg:7,restSec:60,calPerSet:5,note:"Single arm. Raise to shoulder height only."},
  {id:"lib_dfa", name:"DB Arnold Press",               machine:"Dumbbells",muscle:"shoulders",sets:3,reps:"12",weightKg:10,restSec:75,calPerSet:7,note:"Start palms facing you, rotate out as you press."},
  {id:"lib_upr", name:"Cable Upright Row",             machine:"Dual Cable Pulley",muscle:"shoulders",sets:3,reps:"12",weightKg:15,restSec:75,calPerSet:6,note:"Close grip. Pull to chin. Elbows flare."},
  {id:"lib_cbc", name:"Cable Bicep Curl",              machine:"Dual Cable Pulley",muscle:"biceps",sets:3,reps:"15",weightKg:10,restSec:60,calPerSet:5,note:"Both cables. Keep upper arms still."},
  {id:"lib_inc", name:"Incline DB Curl",               machine:"Dumbbells",muscle:"biceps",sets:3,reps:"12",weightKg:8,restSec:75,calPerSet:5,note:"Bench 45-60°. Long head stretch. Full ROM."},
  {id:"lib_czc", name:"EZ Bar Preacher Curl",          machine:"EZ Curl Bar",muscle:"biceps",sets:3,reps:"12",weightKg:15,restSec:75,calPerSet:6,note:"Use flat bench as preacher. Isolates peak."},
  {id:"lib_ohe", name:"DB Overhead Tricep Ext",        machine:"Dumbbells",muscle:"triceps",sets:3,reps:"15",weightKg:12,restSec:60,calPerSet:5,note:"Both hands on one DB overhead."},
  {id:"lib_cko", name:"Cable Kickback",                machine:"Dual Cable Pulley",muscle:"triceps",sets:3,reps:"15",weightKg:8,restSec:60,calPerSet:4,note:"Hinge forward. Upper arm locked. Full extension."},
  {id:"lib_slp2",name:"Leg Press (Single Leg)",        machine:"45° Leg Press",muscle:"quads",sets:3,reps:"12 each",weightKg:40,restSec:90,calPerSet:9,note:"One leg at a time. Catches imbalances."},
  {id:"lib_wsl", name:"Smith Machine Wall Squat",      machine:"Smith Machine",muscle:"quads",sets:3,reps:"15",weightKg:20,restSec:60,calPerSet:7,note:"Feet forward. Knee-friendly."},
  {id:"lib_sld", name:"Stiff Leg Deadlift (DB)",       machine:"Dumbbells",muscle:"hamstrings",sets:3,reps:"12",weightKg:15,restSec:75,calPerSet:7,note:"Slight knee bend. Feel hamstring stretch."},
  {id:"lib_lge", name:"Leg Extension",                 machine:"Leg Curl Machine",muscle:"quads",sets:3,reps:"15",weightKg:30,restSec:60,calPerSet:6,note:"Full extension. Squeeze quad at top."},
  {id:"lib_hbt", name:"Hip Thrust (Smith)",            machine:"Smith Machine",muscle:"glutes",sets:4,reps:"15",weightKg:20,restSec:75,calPerSet:8,note:"Shoulders on bench. Drive hips up."},
  {id:"lib_dgk", name:"Donkey Kick (Cable)",           machine:"Dual Cable Pulley",muscle:"glutes",sets:3,reps:"15 each",weightKg:10,restSec:60,calPerSet:5,note:"Ankle attachment. Full glute extension."},
  {id:"lib_cwd", name:"Cable Wood Chop",               machine:"Dual Cable Pulley",muscle:"core",sets:3,reps:"15 each",weightKg:12,restSec:60,calPerSet:5,note:"High to low diagonal. Rotate through core."},
  {id:"lib_crc", name:"Cable Crunch",                  machine:"Dual Cable Pulley",muscle:"core",sets:3,reps:"20",weightKg:20,restSec:45,calPerSet:4,note:"Kneel. Pull to forehead. Crunch hard."},
  {id:"lib_pab", name:"Pallof Press",                  machine:"Dual Cable Pulley",muscle:"core",sets:3,reps:"15 each",weightKg:10,restSec:60,calPerSet:4,note:"Stand sideways. Press out, hold 2s, return."},
  {id:"lib_tmhi",name:"Treadmill HIIT Round",          machine:"Treadmill",muscle:"cardio",sets:6,reps:"40s sprint/80s walk",weightKg:0,restSec:80,calPerSet:20,note:"Sprint 10-12 km/h, walk 4 km/h."},
  {id:"lib_bkz2",name:"Bike Zone 2 Block",             machine:"Stationary Bike",muscle:"cardio",sets:1,reps:"20 min",weightKg:0,restSec:0,calPerSet:140,note:"Resistance 5. HR 130-140. Zone 2 fat burn."},
  {id:"lib_tmw", name:"Treadmill Incline Walk",        machine:"Treadmill",muscle:"cardio",sets:1,reps:"15 min",weightKg:0,restSec:0,calPerSet:90,note:"5-6 km/h, incline 10-12%."},
];

const WEEKLY_PLAN = [
  // ── MON: Heavy Upper Push ─────────────────────────────────────────────────
  {day:"MON",label:"Heavy Upper Push",type:"upper",tagline:"Chest · Shoulders · Triceps",color:"#f97316",
   duration60:60,duration90:90,
   exercises:[
    {id:"mon_smc", name:"Smith Machine Chest Press",  machine:"Smith Machine",         muscle:"chest",     sets:4,reps:"8-10", weightKg:20,restSec:90,calPerSet:9, note:"Bar=20kg. Heavy — controlled 3s descent, explosive up."},
    {id:"mon_dif", name:"Incline DB Press",           machine:"Dumbbells",             muscle:"chest",     sets:4,reps:"10",   weightKg:14,restSec:90,calPerSet:8, note:"Per dumbbell. 30-45° incline. Upper chest focus."},
    {id:"mon_dsp", name:"DB Shoulder Press",          machine:"Dumbbells",             muscle:"shoulders", sets:4,reps:"10",   weightKg:12,restSec:75,calPerSet:8, note:"Per dumbbell. Drive overhead. Don't lock out."},
    {id:"mon_cll", name:"Cable Lateral Raise",        machine:"Dual Cable Pulley",     muscle:"shoulders", sets:3,reps:"15",   weightKg:5, restSec:60,calPerSet:5, note:"Single arm. Cable low. Raise to shoulder height only."},
    {id:"mon_cpd", name:"Cable Pushdown",             machine:"Dual Cable Pulley",     muscle:"triceps",   sets:4,reps:"12",   weightKg:17,restSec:60,calPerSet:6, note:"Rope attachment. Elbows pinned. Full extension."},
    {id:"mon_skt", name:"Skull Crushers",             machine:"EZ Curl Bar",           muscle:"triceps",   sets:3,reps:"12",   weightKg:20,restSec:60,calPerSet:6, note:"EZ bar 20kg. Lower to forehead with control."},
   ],
   exercises90:[
    {id:"mon_dcf", name:"Cable Crossover Fly",        machine:"Dual Cable Pulley",     muscle:"chest",     sets:3,reps:"15",   weightKg:8, restSec:60,calPerSet:6, note:"Arms wide, slight elbow bend. Squeeze at centre."},
    {id:"mon_dfa", name:"DB Arnold Press",            machine:"Dumbbells",             muscle:"shoulders", sets:3,reps:"12",   weightKg:10,restSec:75,calPerSet:7, note:"Start palms facing you, rotate out as you press up."},
    {id:"mon_ohe", name:"DB Overhead Tricep Ext",     machine:"Dumbbells",             muscle:"triceps",   sets:3,reps:"15",   weightKg:12,restSec:60,calPerSet:5, note:"Both hands on one DB. Long head stretch."},
   ]},

  // ── TUE: Legs + Cardio ────────────────────────────────────────────────────
  {day:"TUE",label:"Legs + Cardio",type:"lower",tagline:"Quads · Hams · Calves + Bike",color:"#f59e0b",
   duration60:60,duration90:90,
   exercises:[
    {id:"tue_lp4", name:"45° Leg Press",             machine:"45° Leg Press",          muscle:"quads",     sets:4,reps:"12-15",weightKg:60,restSec:90,calPerSet:10,note:"Feet shoulder-width. Don't lock knees. Full ROM."},
    {id:"tue_slq", name:"Smith Machine Squat",       machine:"Smith Machine",          muscle:"quads",     sets:3,reps:"12",   weightKg:20,restSec:90,calPerSet:9, note:"Bar only. Feet slightly forward. Spine supported."},
    {id:"tue_lcr", name:"Lying Leg Curl",            machine:"Leg Curl Machine",       muscle:"hamstrings",sets:3,reps:"12-15",weightKg:25,restSec:75,calPerSet:7, note:"Full ROM. Don't swing hips. Slow negative."},
    {id:"tue_crf", name:"Standing Calf Raise",       machine:"Calf Machine",           muscle:"calves",    sets:4,reps:"20",   weightKg:40,restSec:45,calPerSet:4, note:"Full stretch at bottom. Pause 1s at top."},
    {id:"tue_bike",name:"Bike Finisher",             machine:"Stationary Bike",        muscle:"cardio",    sets:1,reps:"10 min",weightKg:0,restSec:0, calPerSet:70,note:"Resistance 5-6. HR 130-140. Zone 2 fat burn."},
   ],
   exercises90:[
    {id:"tue_slp", name:"Leg Press (Single Leg)",    machine:"45° Leg Press",          muscle:"quads",     sets:3,reps:"12 each",weightKg:40,restSec:90,calPerSet:9,note:"One leg. Catches imbalances. Great for recomp."},
    {id:"tue_sld", name:"Stiff Leg Deadlift (DB)",   machine:"Dumbbells",              muscle:"hamstrings",sets:3,reps:"12",   weightKg:15,restSec:75,calPerSet:7, note:"Per dumbbell. Hinge at hips. Feel hamstring stretch."},
    {id:"tue_hiit",name:"Bike HIIT",                 machine:"Stationary Bike",        muscle:"cardio",    sets:6,reps:"40s hard/80s easy",weightKg:0,restSec:80,calPerSet:18,note:"Resistance 8 sprint, 4 easy. HR max on sprints."},
   ]},

  // ── WED: Heavy Upper Pull ─────────────────────────────────────────────────
  {day:"WED",label:"Heavy Upper Pull",type:"upper",tagline:"Back · Lats · Biceps",color:"#6366f1",
   duration60:60,duration90:90,
   exercises:[
    {id:"wed_hhr", name:"High Hammer Row",           machine:"High Hammer Row",        muscle:"back",      sets:4,reps:"8-10", weightKg:35,restSec:90,calPerSet:10,note:"Chest on pad. Heavy. Pull to lower chest. Full stretch."},
    {id:"wed_sml", name:"Smith Machine Bent Row",    machine:"Smith Machine",          muscle:"back",      sets:4,reps:"10",   weightKg:30,restSec:90,calPerSet:9, note:"20kg bar. Hinge 45°. Pull to lower chest. Squeeze."},
    {id:"wed_csr", name:"Cable Seated Row",          machine:"Dual Cable Pulley",      muscle:"lats",      sets:3,reps:"12",   weightKg:27,restSec:75,calPerSet:7, note:"Close grip. Pull to navel. Hold 1s. Don't lean back."},
    {id:"wed_ezc", name:"EZ Bar Curl",               machine:"EZ Curl Bar",            muscle:"biceps",    sets:4,reps:"10",   weightKg:22,restSec:75,calPerSet:7, note:"Heavy. No swinging. Full supination at top."},
    {id:"wed_hac", name:"Hammer Curl",               machine:"Dumbbells",              muscle:"biceps",    sets:3,reps:"12",   weightKg:12,restSec:60,calPerSet:5, note:"Per dumbbell. Neutral grip. Brachialis focus."},
    {id:"wed_dbr", name:"Rear Delt Fly",             machine:"Dumbbells",              muscle:"shoulders", sets:3,reps:"15",   weightKg:8, restSec:60,calPerSet:5, note:"Bend 90°. Slight elbow bend. Squeeze rear delts."},
   ],
   exercises90:[
    {id:"wed_cpr", name:"Cable Pullover",            machine:"Dual Cable Pulley",      muscle:"lats",      sets:3,reps:"15",   weightKg:15,restSec:60,calPerSet:6, note:"Stand back to cable. Arms straight. Pull to hips."},
    {id:"wed_inc", name:"Incline DB Curl",           machine:"Dumbbells",              muscle:"biceps",    sets:3,reps:"12",   weightKg:9, restSec:75,calPerSet:5, note:"Bench 45-60°. Long head stretch. Full ROM."},
    {id:"wed_czc", name:"EZ Bar Preacher Curl",      machine:"EZ Curl Bar",            muscle:"biceps",    sets:3,reps:"12",   weightKg:15,restSec:75,calPerSet:6, note:"Use flat bench as preacher. Isolates bicep peak."},
   ]},

  // ── THU: Moderate Full Body (Office day) ──────────────────────────────────
  {day:"THU",label:"Full Body Moderate",type:"mix",tagline:"Shoulders · Arms · Core + Treadmill",color:"#10b981",
   duration60:60,duration90:90,
   exercises:[
    {id:"thu_dsp", name:"DB Shoulder Press",         machine:"Dumbbells",              muscle:"shoulders", sets:3,reps:"12",   weightKg:10,restSec:75,calPerSet:7, note:"Moderate weight. Focus on full ROM and control."},
    {id:"thu_cll", name:"Cable Lateral Raise",       machine:"Dual Cable Pulley",      muscle:"shoulders", sets:3,reps:"15",   weightKg:5, restSec:60,calPerSet:5, note:"Single arm. Slow and controlled. No swinging."},
    {id:"thu_ezc", name:"EZ Bar Curl",               machine:"EZ Curl Bar",            muscle:"biceps",    sets:3,reps:"12",   weightKg:20,restSec:60,calPerSet:6, note:"Moderate weight. Controlled. Supinate at top."},
    {id:"thu_cpd", name:"Cable Pushdown",            machine:"Dual Cable Pulley",      muscle:"triceps",   sets:3,reps:"15",   weightKg:15,restSec:60,calPerSet:5, note:"Rope attachment. Elbows pinned. Full extension."},
    {id:"thu_cor", name:"Cable Core Rotation",       machine:"Dual Cable Pulley",      muscle:"core",      sets:3,reps:"15",   weightKg:10,restSec:45,calPerSet:4, note:"Stand sideways. Rotate from core not arms."},
    {id:"thu_tmw", name:"Treadmill Walk",            machine:"Treadmill",              muscle:"cardio",    sets:1,reps:"10 min",weightKg:0,restSec:0, calPerSet:65,note:"5 km/h, incline 8-10%. Low impact. Office-day friendly."},
   ],
   exercises90:[
    {id:"thu_upr", name:"Cable Upright Row",         machine:"Dual Cable Pulley",      muscle:"shoulders", sets:3,reps:"12",   weightKg:15,restSec:75,calPerSet:6, note:"Close grip. Pull to chin. Elbows flare out."},
    {id:"thu_crc", name:"Cable Crunch",              machine:"Dual Cable Pulley",      muscle:"core",      sets:3,reps:"20",   weightKg:20,restSec:45,calPerSet:4, note:"Kneel. Pull to forehead. Crunch hard. Slow negative."},
    {id:"thu_tmw2",name:"Extended Incline Walk",     machine:"Treadmill",              muscle:"cardio",    sets:1,reps:"15 min",weightKg:0,restSec:0, calPerSet:95,note:"5-6 km/h, incline 10%. Steady fat burn."},
   ]},

  // ── FRI: Lower Light + Cardio (Office day) ────────────────────────────────
  {day:"FRI",label:"Lower Light + Cardio",type:"lower",tagline:"Glutes · Hams · Calves + Treadmill",color:"#ec4899",
   duration60:60,duration90:90,
   exercises:[
    {id:"fri_lpw", name:"Leg Press Wide Stance",     machine:"45° Leg Press",          muscle:"glutes",    sets:3,reps:"15",   weightKg:55,restSec:75,calPerSet:9, note:"Wide feet + toes out = glute emphasis. Light-moderate."},
    {id:"fri_cbd", name:"Cable Glute Kickback",      machine:"Dual Cable Pulley",      muscle:"glutes",    sets:3,reps:"15",   weightKg:10,restSec:60,calPerSet:5, note:"Ankle attachment. Hinge forward slightly. Squeeze glute."},
    {id:"fri_lcv", name:"Lying Leg Curl",            machine:"Leg Curl Machine",       muscle:"hamstrings",sets:3,reps:"15",   weightKg:22,restSec:60,calPerSet:6, note:"Lighter than Tue. Control the movement. No swinging."},
    {id:"fri_crf", name:"Seated Calf Raise",         machine:"Calf Machine",           muscle:"calves",    sets:3,reps:"20",   weightKg:35,restSec:45,calPerSet:4, note:"2s up, 2s hold, 2s down. Full stretch at bottom."},
    {id:"fri_tmss",name:"Treadmill Steady State",    machine:"Treadmill",              muscle:"cardio",    sets:1,reps:"15 min",weightKg:0,restSec:0, calPerSet:95,note:"5 km/h, incline 6-8%. Zone 2. Office-day friendly."},
   ],
   exercises90:[
    {id:"fri_hbt", name:"Hip Thrust (Smith)",        machine:"Smith Machine",          muscle:"glutes",    sets:3,reps:"15",   weightKg:20,restSec:75,calPerSet:8, note:"Shoulders on bench. Drive hips up. Squeeze at top."},
    {id:"fri_dgk", name:"Donkey Kick (Cable)",       machine:"Dual Cable Pulley",      muscle:"glutes",    sets:3,reps:"15 each",weightKg:10,restSec:60,calPerSet:5,note:"Ankle attachment. Full glute extension. Squeeze hard."},
    {id:"fri_bkss",name:"Bike Steady State",         machine:"Stationary Bike",        muscle:"cardio",    sets:1,reps:"20 min",weightKg:0,restSec:0, calPerSet:140,note:"Resistance 5. HR 130-140. Zone 2 fat burn."},
   ]},

  // ── SAT: Upper + Cardio Mix ───────────────────────────────────────────────
  {day:"SAT",label:"Upper + Cardio Mix",type:"mix",tagline:"Chest · Back · Shoulders + Bike",color:"#8b5cf6",
   duration60:60,duration90:90,
   exercises:[
    {id:"sat_smc", name:"Smith Machine Chest Press", machine:"Smith Machine",          muscle:"chest",     sets:3,reps:"12",   weightKg:20,restSec:75,calPerSet:8, note:"Moderate weight. Good form. Last session before Sun."},
    {id:"sat_hhr", name:"High Hammer Row",           machine:"High Hammer Row",        muscle:"back",      sets:3,reps:"12",   weightKg:30,restSec:75,calPerSet:8, note:"Moderate. Full stretch at top. Controlled pull."},
    {id:"sat_dsp", name:"DB Shoulder Press",         machine:"Dumbbells",              muscle:"shoulders", sets:3,reps:"12",   weightKg:10,restSec:75,calPerSet:7, note:"Moderate. Good ROM. No locking out."},
    {id:"sat_csr", name:"Cable Seated Row",          machine:"Dual Cable Pulley",      muscle:"lats",      sets:3,reps:"12",   weightKg:22,restSec:75,calPerSet:7, note:"Close grip. Pull to navel. Hold 1s."},
    {id:"sat_bk",  name:"Bike Cardio",               machine:"Stationary Bike",        muscle:"cardio",    sets:1,reps:"15 min",weightKg:0,restSec:0, calPerSet:100,note:"Resistance 5-6. HR 130-140. Zone 2 fat burn."},
   ],
   exercises90:[
    {id:"sat_dbr", name:"Rear Delt Fly",             machine:"Dumbbells",              muscle:"shoulders", sets:3,reps:"15",   weightKg:8, restSec:60,calPerSet:5, note:"Bend 90°. Slight elbow bend. Squeeze rear delts."},
    {id:"sat_dif", name:"Cable Crossover",           machine:"Dual Cable Pulley",      muscle:"chest",     sets:3,reps:"15",   weightKg:8, restSec:60,calPerSet:6, note:"Arms wide. Slight elbow bend. Squeeze at centre."},
    {id:"sat_hiit",name:"Bike HIIT Finisher",        machine:"Stationary Bike",        muscle:"cardio",    sets:5,reps:"45s hard/75s easy",weightKg:0,restSec:75,calPerSet:20,note:"Resistance 8 sprint, 4 easy. Max effort on sprints."},
   ]},

  // ── SUN: 90min Max Burn ───────────────────────────────────────────────────
  {day:"SUN",label:"Max Burn Sunday",type:"cardio",tagline:"HIIT · Compounds · Steady State",color:"#ef4444",
   duration60:60,duration90:90,
   exercises:[
    {id:"sun_trwu",name:"Treadmill Warm-Up",         machine:"Treadmill",              muscle:"cardio",    sets:1,reps:"5 min", weightKg:0,restSec:0, calPerSet:35, note:"4-5 km/h. Incline 1%. HR to 110-120 bpm."},
    {id:"sun_hiit",name:"Treadmill HIIT",            machine:"Treadmill",              muscle:"cardio",    sets:8,reps:"30s sprint/60s walk",weightKg:0,restSec:60,calPerSet:22,note:"Sprint 9-11 km/h, walk 4 km/h. Total ~16 mins."},
    {id:"sun_smls",name:"Smith Machine Lunge",       machine:"Smith Machine",          muscle:"glutes",    sets:3,reps:"10 each",weightKg:20,restSec:60,calPerSet:10,note:"Bar only. Front knee above ankle. Explosive drive up."},
    {id:"sun_lp",  name:"Leg Press Burnout",         machine:"45° Leg Press",          muscle:"quads",     sets:3,reps:"20",   weightKg:50,restSec:60,calPerSet:9, note:"High reps, moderate weight. Burn out the quads."},
    {id:"sun_smc", name:"Smith Machine Push",        machine:"Smith Machine",          muscle:"chest",     sets:3,reps:"15",   weightKg:20,restSec:60,calPerSet:7, note:"Bar only. High reps. Keep heart rate up."},
    {id:"sun_bkz", name:"Bike Zone 2",               machine:"Stationary Bike",        muscle:"cardio",    sets:1,reps:"15 min",weightKg:0,restSec:0, calPerSet:100,note:"Resistance 5. HR 130-140. Maximise fat burn."},
   ],
   exercises90:[
    {id:"sun_hhr", name:"High Hammer Row",           machine:"High Hammer Row",        muscle:"back",      sets:3,reps:"15",   weightKg:25,restSec:60,calPerSet:8, note:"Moderate weight. Keep heart rate up. Full ROM."},
    {id:"sun_cor", name:"Cable Core Rotation",       machine:"Dual Cable Pulley",      muscle:"core",      sets:3,reps:"15",   weightKg:10,restSec:45,calPerSet:4, note:"Rotate from core. Keep moving. Active rest."},
    {id:"sun_bkss",name:"Bike Steady State Finish",  machine:"Stationary Bike",        muscle:"cardio",    sets:1,reps:"20 min",weightKg:0,restSec:0, calPerSet:140,note:"Resistance 5-6. HR 130-140. Final calorie sweep."},
   ]},
];


const workoutCalBurn = (exercises) =>
  exercises.reduce((t, ex) => t + ex.calPerSet * (typeof ex.sets === "number" ? ex.sets : 1), 0);

// ─── Muscle SVG ───────────────────────────────────────────────────────────────
const MuscleSVG = ({ muscle, size = 52 }) => {
  const C = {
    chest:      {color:"#f97316",parts:[{d:"M20,28 C20,20 28,16 36,18 C38,24 38,32 36,38 C28,40 20,36 20,28Z"},{d:"M52,28 C52,20 44,16 36,18 C34,24 34,32 36,38 C44,40 52,36 52,28Z"}]},
    shoulders:  {color:"#a855f7",parts:[{d:"M15,22 C10,18 10,28 15,32 C20,30 22,24 20,20Z"},{d:"M57,22 C62,18 62,28 57,32 C52,30 50,24 52,20Z"}]},
    triceps:    {color:"#3b82f6",parts:[{d:"M14,34 C10,36 10,46 14,50 C18,48 20,40 18,36Z"},{d:"M58,34 C62,36 62,46 58,50 C54,48 52,40 54,36Z"}]},
    biceps:     {color:"#10b981",parts:[{d:"M14,34 C18,32 20,40 18,46 C14,46 10,42 10,38Z"},{d:"M58,34 C54,32 52,40 54,46 C58,46 62,42 62,38Z"}]},
    back:       {color:"#6366f1",parts:[{d:"M22,20 C22,18 26,16 36,16 C46,16 50,18 50,20 C50,30 46,40 36,42 C26,40 22,30 22,20Z"}]},
    lats:       {color:"#8b5cf6",parts:[{d:"M20,22 C16,26 16,38 20,42 C26,40 28,32 26,24Z"},{d:"M52,22 C56,26 56,38 52,42 C46,40 44,32 46,24Z"}]},
    quads:      {color:"#f59e0b",parts:[{d:"M22,52 C20,60 20,72 24,78 C28,78 30,68 30,58Z"},{d:"M50,52 C52,60 52,72 48,78 C44,78 42,68 42,58Z"}]},
    hamstrings: {color:"#ef4444",parts:[{d:"M24,52 C22,60 22,70 26,76 C30,74 32,64 30,54Z"},{d:"M48,52 C50,60 50,70 46,76 C42,74 40,64 42,54Z"}]},
    calves:     {color:"#06b6d4",parts:[{d:"M24,78 C22,84 24,92 28,94 C32,90 32,82 30,78Z"},{d:"M48,78 C50,84 48,92 44,94 C40,90 40,82 42,78Z"}]},
    core:       {color:"#84cc16",parts:[{d:"M26,42 C26,46 26,52 36,54 C46,52 46,46 46,42 C42,40 30,40 26,42Z"}]},
    glutes:     {color:"#f43f5e",parts:[{d:"M22,46 C20,50 22,58 28,60 C32,58 34,52 32,46Z"},{d:"M50,46 C52,50 50,58 44,60 C40,58 38,52 40,46Z"}]},
    cardio:     {color:"#ef4444",parts:[{d:"M36,20 C28,20 22,26 22,34 C22,44 36,56 36,56 C36,56 50,44 50,34 C50,26 44,20 36,20Z"}]},
  };
  const cfg = C[muscle] || C.core;
  return (
    <svg width={size} height={size} viewBox="0 0 72 100" style={{filter:`drop-shadow(0 0 5px ${cfg.color}60)`}}>
      <ellipse cx="36" cy="14" rx="10" ry="12" fill="#1e293b" stroke="#334155" strokeWidth="1"/>
      <path d="M22,24 C18,28 16,36 16,48 L16,52 L56,52 L56,48 C56,36 54,28 50,24 C46,22 26,22 22,24Z" fill="#1e293b" stroke="#334155" strokeWidth="1"/>
      <path d="M16,52 L14,80 L22,80 L26,60 L46,60 L50,80 L58,80 L56,52Z" fill="#1e293b" stroke="#334155" strokeWidth="1"/>
      <path d="M26,60 L24,98 L32,98 L36,72 L40,98 L48,98 L46,60Z" fill="#1e293b" stroke="#334155" strokeWidth="1"/>
      <path d="M22,26 L12,32 L10,52 L16,54 L18,38Z" fill="#1e293b" stroke="#334155" strokeWidth="1"/>
      <path d="M50,26 L60,32 L62,52 L56,54 L54,38Z" fill="#1e293b" stroke="#334155" strokeWidth="1"/>
      {cfg.parts.map((p,i) => <path key={i} d={p.d} fill={cfg.color} opacity="0.85"/>)}
    </svg>
  );
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
const GlowBtn = ({children,onClick,color="#6366f1",small,full,disabled,style={}}) => (
  <button onClick={onClick} disabled={disabled} style={{background:disabled?"#1e293b":`linear-gradient(135deg,${color},${color}cc)`,border:"none",borderRadius:small?8:12,padding:small?"6px 12px":full?"13px 0":"10px 20px",width:full?"100%":"auto",color:disabled?"#475569":"#fff",fontSize:small?12:14,fontFamily:"'Barlow',sans-serif",fontWeight:700,cursor:disabled?"not-allowed":"pointer",boxShadow:disabled?"none":`0 0 14px ${color}40`,letterSpacing:0.5,...style}}>{children}</button>
);
const Pill = ({children,color}) => (
  <span style={{background:`${color}20`,border:`1px solid ${color}50`,color,borderRadius:20,padding:"2px 10px",fontSize:11,fontFamily:"'Barlow',sans-serif",fontWeight:600,letterSpacing:1}}>{children}</span>
);
const SLabel = ({children}) => (
  <div style={{fontSize:11,fontFamily:"'Barlow',monospace",letterSpacing:2,color:"#64748b",textTransform:"uppercase",marginBottom:6}}>{children}</div>
);
const SInput = ({style={},...p}) => (
  <input {...p} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,padding:"10px 14px",color:"#e2e8f0",fontSize:14,fontFamily:"'Barlow',sans-serif",width:"100%",boxSizing:"border-box",outline:"none",...style}}/>
);
const SSelect = ({style={},...p}) => (
  <select {...p} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,padding:"10px 14px",color:"#e2e8f0",fontSize:14,fontFamily:"'Barlow',sans-serif",width:"100%",boxSizing:"border-box",outline:"none",...style}}/>
);
const Card = ({children,style={}}) => (
  <div style={{background:"#0f172a",borderRadius:16,padding:"18px",marginBottom:14,border:"1px solid #1e293b",...style}}>{children}</div>
);
const Tag = ({children,onRemove,red}) => (
  <div style={{display:"inline-flex",alignItems:"center",gap:6,background:red?"#3d1515":"#1e293b",border:`1px solid ${red?"#7f1d1d":"#2a3045"}`,borderRadius:8,padding:"5px 10px",fontSize:13,color:red?"#fca5a5":"#cbd5e1",margin:"3px"}}>
    {children}<span onClick={onRemove} style={{cursor:"pointer",opacity:0.6,fontSize:15}}>×</span>
  </div>
);

// ─── Rest Timer ───────────────────────────────────────────────────────────────
function RestTimer({seconds,onDone}) {
  const [left,setLeft] = useState(seconds);
  useEffect(()=>{
    if(left<=0){onDone();return;}
    const t=setTimeout(()=>setLeft(l=>l-1),1000);
    return ()=>clearTimeout(t);
  },[left]);
  return (
    <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"#0f172a",border:"1px solid #1e293b",borderRadius:20,padding:"16px 28px",zIndex:999,textAlign:"center",minWidth:180,boxShadow:"0 8px 40px #000a"}}>
      <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:40,fontWeight:800,color:left<=10?"#ef4444":"#10b981",lineHeight:1}}>{left}s</div>
      <div style={{fontSize:11,color:"#475569",fontFamily:"'Barlow',sans-serif",marginBottom:8}}>REST</div>
      <div style={{background:"#1e293b",borderRadius:4,height:4,overflow:"hidden"}}>
        <div style={{width:`${(left/seconds)*100}%`,height:"100%",background:left<=10?"#ef4444":"#10b981",transition:"width 1s linear"}}/>
      </div>
      <button onClick={onDone} style={{marginTop:10,background:"none",border:"none",color:"#475569",fontSize:12,cursor:"pointer",fontFamily:"'Barlow',sans-serif"}}>Skip ×</button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TODAY TAB
// ══════════════════════════════════════════════════════════════════════════════
function TodayTab({dayData,saveDay,profile,workoutBurnToday}) {
  const d = dayData;
  const net = netCalories(d, workoutBurnToday);
  const junkCal = (d.junk||[]).reduce((a,j)=>a+(parseFloat(j.cal)||0),0);
  const mealCal = (d.meals||[]).reduce((a,m)=>a+(parseFloat(m.cal)||0),0);
  const extraBurnt = (d.exercises||[]).reduce((a,e)=>a+(parseFloat(e.calBurnt)||0),0);
  const totalBurnt = (workoutBurnToday || 0) + extraBurnt;
  const est = calToWeight(net);

  return (
    <>
      <Card>
        <SLabel>Today's Weight (kg)</SLabel>
        <SInput type="number" placeholder="e.g. 78.5" value={d.weight} onChange={e=>saveDay({...d,weight:e.target.value})}/>
      </Card>

      <Card style={{background:"linear-gradient(135deg,#0f172a,#1e1535)",border:"1px solid #2a1f4a"}}>
        <SLabel>Calorie Balance</SLabel>
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          {[{label:"Eaten",val:mealCal+junkCal,col:"#a78bfa"},{label:"Burnt",val:totalBurnt,col:"#34d399"},{label:"Net",val:net,col:net>0?"#fb923c":"#34d399"}].map(x=>(
            <div key={x.label} style={{flex:1,background:"#0a0d16",borderRadius:12,padding:"12px 8px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:x.col,fontFamily:"'Barlow Condensed',sans-serif"}}>{x.val}</div>
              <div style={{fontSize:10,color:"#64748b",fontFamily:"'Barlow',sans-serif",letterSpacing:1}}>{x.label} kcal</div>
            </div>
          ))}
        </div>
        {workoutBurnToday > 0 && (
          <div style={{fontSize:12,color:"#10b981",fontFamily:"'Barlow',sans-serif",marginBottom:4}}>💪 Gym session: −{workoutBurnToday} kcal (from Workout tab)</div>
        )}
        {extraBurnt > 0 && (
          <div style={{fontSize:12,color:"#34d399",fontFamily:"'Barlow',sans-serif",marginBottom:4}}>🏃 Extra activity: −{extraBurnt} kcal (from non-gym log)</div>
        )}
        {workoutBurnToday === 0 && extraBurnt === 0 && (
          <div style={{fontSize:12,color:"#475569",fontFamily:"'Barlow',sans-serif",marginBottom:4}}>💪 No burn logged yet — finish a workout or log activity below</div>
        )}
        <div style={{padding:"10px 14px",background:"#0a0d16",borderRadius:10,fontSize:13,color:net>0?"#fb923c":"#4ade80"}}>
          {net>0?`⬆ Surplus ${net} kcal → est. +${est} kg today`:`⬇ Deficit ${Math.abs(net)} kcal → est. ${est} kg today`}
        </div>
        {junkCal>0&&(
          <div style={{marginTop:8,padding:"10px 14px",background:"#2d1515",border:"1px solid #7f1d1d",borderRadius:10,fontSize:13,color:"#fca5a5"}}>
            🍟 Junk: <strong>{junkCal} kcal</strong> — {((junkCal/(mealCal+junkCal||1))*100).toFixed(0)}% of total intake
          </div>
        )}
      </Card>

      <Card>
        <SLabel>Water Intake</SLabel>
        <div style={{display:"flex",alignItems:"center",gap:16}}>
          <GlowBtn small color="#0ea5e9" onClick={()=>saveDay({...d,water:Math.max(0,+(d.water-0.25).toFixed(2))})}>−</GlowBtn>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:30,fontWeight:700,color:"#38bdf8",fontFamily:"'Barlow Condensed',sans-serif"}}>{(d.water||0).toFixed(2)}</div>
            <div style={{fontSize:10,color:"#64748b",fontFamily:"'Barlow',sans-serif",letterSpacing:1}}>LITRES / 3L GOAL</div>
            <div style={{marginTop:8,background:"#1e293b",borderRadius:8,height:8,overflow:"hidden"}}>
              <div style={{width:`${Math.min(100,((d.water||0)/3)*100)}%`,height:"100%",background:"linear-gradient(90deg,#0ea5e9,#38bdf8)",borderRadius:8,transition:"width .3s"}}/>
            </div>
          </div>
          <GlowBtn small color="#0ea5e9" onClick={()=>saveDay({...d,water:+(d.water+0.25).toFixed(2)})}>+</GlowBtn>
        </div>
      </Card>

      <ManualExerciseSection d={d} saveDay={saveDay} profile={profile}/>
      <MealSection d={d} saveDay={saveDay}/>
      <JunkSection d={d} saveDay={saveDay}/>
    </>
  );
}

function ManualExerciseSection({d,saveDay,profile}) {
  const [type,setType]=useState("cardio");
  const [name,setName]=useState(CARDIO_EX[0].name);
  const [duration,setDuration]=useState("");
  const [intensity,setIntensity]=useState("moderate");
  const [reps,setReps]=useState(""); const [sets,setSets]=useState("");
  const [calEst,setCalEst]=useState(""); const [calOverride,setCalOverride]=useState("");
  const wKg = parseFloat(profile?.weight)||75;
  useEffect(()=>{
    if(type==="cardio"){
      const ex=CARDIO_EX.find(e=>e.name===name);
      if(!ex||!duration){setCalEst("");return;}
      const mf={low:0.75,moderate:1,high:1.3};
      setCalEst(String(Math.round(ex.met*wKg*(parseFloat(duration)/60)*mf[intensity])));
    }
  },[name,duration,intensity,type,wKg]);
  const add=()=>{
    const calBurnt=calOverride||calEst||"0";
    const entry=type==="cardio"?{type:"cardio",name,duration,intensity,calBurnt}:{type:"strength",name,reps,sets,calBurnt:calOverride||"0"};
    saveDay({...d,exercises:[...(d.exercises||[]),entry]});
    setDuration("");setReps("");setSets("");setCalEst("");setCalOverride("");
  };
  return (
    <Card>
      <SLabel>Extra Exercise (non-gym)</SLabel>
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        {["cardio","strength"].map(t=>(
          <button key={t} onClick={()=>{setType(t);setName(t==="cardio"?CARDIO_EX[0].name:STRENGTH_EX[0]);}} style={{flex:1,padding:"8px 0",border:"none",borderRadius:10,background:type===t?"#6366f1":"#1e293b",color:type===t?"#fff":"#64748b",fontFamily:"'Barlow',sans-serif",fontWeight:600,fontSize:13,cursor:"pointer"}}>
            {t==="cardio"?"🏃 Cardio":"💪 Strength"}
          </button>
        ))}
      </div>
      <SSelect value={name} onChange={e=>setName(e.target.value)} style={{marginBottom:10}}>
        {(type==="cardio"?CARDIO_EX.map(e=>e.name):STRENGTH_EX).map(n=><option key={n}>{n}</option>)}
      </SSelect>
      {type==="cardio"?(
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <div style={{flex:1}}><SLabel>Duration (min)</SLabel><SInput type="number" placeholder="30" value={duration} onChange={e=>setDuration(e.target.value)}/></div>
          <div style={{flex:1}}><SLabel>Intensity</SLabel><SSelect value={intensity} onChange={e=>setIntensity(e.target.value)}><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></SSelect></div>
        </div>
      ):(
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <div style={{flex:1}}><SLabel>Sets</SLabel><SInput type="number" placeholder="3" value={sets} onChange={e=>setSets(e.target.value)}/></div>
          <div style={{flex:1}}><SLabel>Reps</SLabel><SInput type="number" placeholder="12" value={reps} onChange={e=>setReps(e.target.value)}/></div>
        </div>
      )}
      <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"flex-end"}}>
        <div style={{flex:1}}><SLabel>Calories Burnt{calEst?` (est. ${calEst})`:""}</SLabel><SInput type="number" placeholder={calEst||"Enter manually"} value={calOverride} onChange={e=>setCalOverride(e.target.value)}/></div>
        <GlowBtn onClick={add} style={{marginBottom:1}}>Add</GlowBtn>
      </div>
      <div>{(d.exercises||[]).map((e,i)=>(
        <Tag key={i} onRemove={()=>saveDay({...d,exercises:d.exercises.filter((_,j)=>j!==i)})}>
          {e.type==="cardio"?"🏃":"💪"} {e.name}{e.duration?` · ${e.duration}min`:""}{e.sets?` · ${e.sets}×${e.reps}`:""} · <span style={{color:"#4ade80"}}>{e.calBurnt} kcal</span>
        </Tag>
      ))}</div>
    </Card>
  );
}

function MealSection({d,saveDay}) {
  const [sel,setSel]=useState(FOODS[0].name);
  const [time,setTime]=useState(""); const [cal,setCal]=useState(String(FOODS[0].cal)); const [custom,setCustom]=useState("");
  const handleSel=v=>{setSel(v);const f=FOODS.find(x=>x.name===v);if(f&&f.cal>0)setCal(String(f.cal));else setCal("");};
  const add=()=>{
    const name=sel==="Custom..."?custom:sel;
    if(!name||!cal)return;
    saveDay({...d,meals:[...(d.meals||[]),{name,cal:parseFloat(cal),time}]});
    setSel(FOODS[0].name);setCal(String(FOODS[0].cal));setTime("");setCustom("");
  };
  return (
    <Card>
      <SLabel>Meals & Food</SLabel>
      <SSelect value={sel} onChange={e=>handleSel(e.target.value)} style={{marginBottom:10}}>
        {FOODS.map(f=><option key={f.name}>{f.name}</option>)}
      </SSelect>
      {sel==="Custom..."&&<SInput placeholder="Food name" value={custom} onChange={e=>setCustom(e.target.value)} style={{marginBottom:10}}/>}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{flex:1}}><SLabel>Calories</SLabel><SInput type="number" value={cal} onChange={e=>setCal(e.target.value)}/></div>
        <div style={{flex:1}}><SLabel>Time</SLabel><SInput type="time" value={time} onChange={e=>setTime(e.target.value)}/></div>
      </div>
      <GlowBtn full color="#a78bfa" onClick={add} style={{marginBottom:12}}>Add Meal</GlowBtn>
      <div>{(d.meals||[]).map((m,i)=>(
        <Tag key={i} onRemove={()=>saveDay({...d,meals:d.meals.filter((_,j)=>j!==i)})}>
          🥗 {m.name}{m.time?` · ${m.time}`:""} · <span style={{color:"#a78bfa"}}>{m.cal} kcal</span>
        </Tag>
      ))}</div>
    </Card>
  );
}

function JunkSection({d,saveDay}) {
  const [sel,setSel]=useState(JUNK[0].name); const [cal,setCal]=useState(String(JUNK[0].cal)); const [custom,setCustom]=useState("");
  const handleSel=v=>{setSel(v);const f=JUNK.find(x=>x.name===v);if(f&&f.cal>0)setCal(String(f.cal));else setCal("");};
  const junkTotal=(d.junk||[]).reduce((a,j)=>a+(j.cal||0),0);
  const mealTotal=(d.meals||[]).reduce((a,m)=>a+(m.cal||0),0);
  const add=()=>{
    const name=sel==="Custom..."?custom:sel;
    if(!name||!cal)return;
    saveDay({...d,junk:[...(d.junk||[]),{name,cal:parseFloat(cal)}]});
    setSel(JUNK[0].name);setCal(String(JUNK[0].cal));setCustom("");
  };
  return (
    <Card style={{border:"1px solid #7f1d1d"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
        <SLabel>🍟 Junk Food</SLabel>
        {junkTotal>0&&<span style={{fontSize:12,color:"#fca5a5",fontFamily:"'Barlow',sans-serif"}}>{junkTotal} kcal</span>}
      </div>
      {junkTotal>0&&mealTotal>0&&(
        <div style={{marginBottom:12,padding:"10px 14px",background:"#1a0a0a",borderRadius:10}}>
          <div style={{fontSize:11,color:"#64748b",fontFamily:"'Barlow',sans-serif",marginBottom:6}}>Healthy vs Junk split</div>
          <div style={{display:"flex",gap:4,height:10,borderRadius:6,overflow:"hidden"}}>
            <div style={{flex:mealTotal,background:"#22c55e",borderRadius:"6px 0 0 6px"}}/>
            <div style={{flex:junkTotal,background:"#ef4444",borderRadius:"0 6px 6px 0"}}/>
          </div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4,fontSize:11,color:"#64748b",fontFamily:"'Barlow',sans-serif"}}>
            <span style={{color:"#4ade80"}}>Healthy {mealTotal}</span><span style={{color:"#f87171"}}>Junk {junkTotal}</span>
          </div>
        </div>
      )}
      <SSelect value={sel} onChange={e=>handleSel(e.target.value)} style={{marginBottom:10}}>
        {JUNK.map(j=><option key={j.name}>{j.name}</option>)}
      </SSelect>
      {sel==="Custom..."&&<SInput placeholder="Junk item name" value={custom} onChange={e=>setCustom(e.target.value)} style={{marginBottom:10}}/>}
      <div style={{display:"flex",gap:8,marginBottom:12}}>
        <div style={{flex:1}}><SLabel>Calories</SLabel><SInput type="number" value={cal} onChange={e=>setCal(e.target.value)}/></div>
        <GlowBtn color="#dc2626" onClick={add} style={{alignSelf:"flex-end"}}>Add</GlowBtn>
      </div>
      <div>{(d.junk||[]).map((j,i)=>(
        <Tag key={i} red onRemove={()=>saveDay({...d,junk:d.junk.filter((_,k)=>k!==i)})}>🚫 {j.name} · {j.cal} kcal</Tag>
      ))}</div>
    </Card>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WORKOUT TAB
// ══════════════════════════════════════════════════════════════════════════════
function WorkoutExCard({ex,dayColor,weights,setWeights,completedSets,setCompletedSets,onRestStart,onRemove}) {
  const w=weights[ex.id]??ex.weightKg;
  const done=completedSets[ex.id]??0;
  const total=typeof ex.sets==="number"?ex.sets:1;
  const isCardio=ex.weightKg===0;
  const allDone=done>=total;
  const markSet=()=>{
    if(done<total){
      setCompletedSets(p=>({...p,[ex.id]:done+1}));
      if(done+1<total&&ex.restSec>0)onRestStart(ex.restSec);
    }
  };
  return (
    <div style={{background:"#0a0d16",border:`1px solid ${allDone?dayColor+"60":"#1e293b"}`,borderRadius:16,padding:"14px",marginBottom:10,position:"relative",transition:"border-color .3s"}}>
      {onRemove&&<button onClick={onRemove} style={{position:"absolute",top:10,right:10,background:"#1e293b",border:"none",borderRadius:6,width:22,height:22,color:"#64748b",fontSize:13,cursor:"pointer",lineHeight:1}}>×</button>}
      <div style={{display:"flex",gap:12,alignItems:"flex-start"}}>
        <div style={{flexShrink:0}}><MuscleSVG muscle={ex.muscle} size={48}/></div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:700,color:"#f1f5f9",paddingRight:onRemove?24:0,lineHeight:1.2}}>{ex.name} {allDone&&<span style={{color:dayColor}}>✓</span>}</div>
          <div style={{fontSize:11,color:"#475569",fontFamily:"'Barlow',sans-serif",marginBottom:6}}>📍 {ex.machine}</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            <Pill color={dayColor}>{ex.sets}×{ex.reps}</Pill>
            {!isCardio&&<Pill color="#94a3b8">{w}kg</Pill>}
            <Pill color="#64748b">{ex.restSec>0?`${ex.restSec}s rest`:"No rest"}</Pill>
          </div>
          {!isCardio&&(
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
              <span style={{fontSize:11,color:"#475569",fontFamily:"'Barlow',sans-serif"}}>Wt:</span>
              <button onClick={()=>setWeights(p=>({...p,[ex.id]:Math.max(0,w-2.5)}))} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:5,width:24,height:24,color:"#94a3b8",fontSize:14,cursor:"pointer",lineHeight:1}}>−</button>
              <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,color:"#f1f5f9",fontSize:14,minWidth:36,textAlign:"center"}}>{w}kg</span>
              <button onClick={()=>setWeights(p=>({...p,[ex.id]:w+2.5}))} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:5,width:24,height:24,color:"#94a3b8",fontSize:14,cursor:"pointer",lineHeight:1}}>+</button>
            </div>
          )}
          <div style={{fontSize:11,color:"#475569",fontStyle:"italic",fontFamily:"'Barlow',sans-serif",marginBottom:8,lineHeight:1.5}}>💡 {ex.note}</div>
          <div style={{display:"flex",gap:5,alignItems:"center",flexWrap:"wrap"}}>
            {Array.from({length:total}).map((_,i)=>(
              <div key={i} style={{width:26,height:26,borderRadius:7,background:i<done?dayColor:"#1e293b",border:`1px solid ${i<done?dayColor:"#334155"}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:i<done?"#fff":"#475569",fontWeight:700,transition:"all .2s"}}>
                {i<done?"✓":i+1}
              </div>
            ))}
            {!allDone&&<GlowBtn small color={dayColor} onClick={markSet} style={{marginLeft:6}}>Set {done+1}</GlowBtn>}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddExercisePanel({plan,extraExercises,setExtraExercises,weights,setWeights,onClose}) {
  const [mode,setMode]=useState("browse");
  const [fMuscle,setFMuscle]=useState("all"); const [fMachine,setFMachine]=useState("all");
  const [aiList,setAiList]=useState([]); const [aiLoad,setAiLoad]=useState(false); const [aiErr,setAiErr]=useState("");
  const addedIds=new Set([...plan.exercises.map(e=>e.id),...extraExercises.map(e=>e.id)]);
  const filtered=EXERCISE_LIBRARY.filter(ex=>!addedIds.has(ex.id)&&(fMuscle==="all"||ex.muscle===fMuscle)&&(fMachine==="all"||ex.machine===fMachine));
  const addEx=(ex)=>{
    const ne={...ex,id:ex.id+"_"+Date.now()};
    setExtraExercises(p=>[...p,ne]);
    setWeights(p=>({...p,[ne.id]:ex.weightKg}));
  };
  const getAI=async()=>{
    setAiLoad(true);setAiErr("");setAiList([]);
    const done=plan.exercises.map(e=>e.name).join(", ");
    const muscles=[...new Set(plan.exercises.map(e=>e.muscle))].join(", ");
    const prompt=`Gym trainer. Person just did: ${done} (muscles: ${muscles}). Goal: recomp (fat loss + muscle). Weight: 81kg. Avoid heavy spinal load. Available machines: ${MACHINES.join(", ")}. Suggest 4 additional exercises for 90min total. Respond ONLY with JSON array, no markdown: [{"name":"...","machine":"...","muscle":"...","sets":3,"reps":"12","weightKg":10,"restSec":60,"calPerSet":6,"note":"..."}] muscle must be one of: ${MUSCLES.join(",")}`;
    try {
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
      const data=await res.json();
      const text=(data.content||[]).filter(c=>c.type==="text").map(c=>c.text).join("");
      setAiList(JSON.parse(text.replace(/```json|```/g,"").trim()).map((s,i)=>({...s,id:`ai_${Date.now()}_${i}`})));
    } catch(e){setAiErr("AI suggestion failed. Use Browse tab.");}
    setAiLoad(false);
  };
  return (
    <div style={{position:"fixed",inset:0,background:"#000c",zIndex:200,display:"flex",alignItems:"flex-end"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#0a0f1e",borderRadius:"20px 20px 0 0",width:"100%",maxHeight:"85vh",overflowY:"auto",padding:"20px 16px 40px",border:"1px solid #1e293b"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:800,color:"#f1f5f9"}}>+ ADD EXERCISES</div>
          <button onClick={onClose} style={{background:"#1e293b",border:"none",borderRadius:8,padding:"6px 14px",color:"#94a3b8",cursor:"pointer",fontFamily:"'Barlow',sans-serif",fontWeight:600}}>Done</button>
        </div>
        <div style={{display:"flex",background:"#1e293b",borderRadius:12,padding:3,marginBottom:14}}>
          {[{id:"browse",label:"📋 Browse"},{id:"ai",label:"🤖 AI Suggest"}].map(m=>(
            <button key={m.id} onClick={()=>setMode(m.id)} style={{flex:1,padding:"9px 0",border:"none",borderRadius:10,background:mode===m.id?"#6366f1":"transparent",color:mode===m.id?"#fff":"#64748b",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>{m.label}</button>
          ))}
        </div>
        {mode==="browse"&&(
          <>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              <select value={fMuscle} onChange={e=>setFMuscle(e.target.value)} style={{flex:1,background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"7px 10px",color:"#e2e8f0",fontSize:13,fontFamily:"'Barlow',sans-serif"}}>
                <option value="all">All muscles</option>{MUSCLES.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
              <select value={fMachine} onChange={e=>setFMachine(e.target.value)} style={{flex:1,background:"#1e293b",border:"1px solid #334155",borderRadius:8,padding:"7px 10px",color:"#e2e8f0",fontSize:13,fontFamily:"'Barlow',sans-serif"}}>
                <option value="all">All machines</option>{MACHINES.map(m=><option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            {filtered.length===0&&<div style={{color:"#475569",fontSize:13,fontFamily:"'Barlow',sans-serif",textAlign:"center",padding:20}}>All exercises in this category already added.</div>}
            {filtered.map(ex=>(
              <div key={ex.id} style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                <MuscleSVG muscle={ex.muscle} size={42}/>
                <div style={{flex:1}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:15,fontWeight:700,color:"#f1f5f9"}}>{ex.name}</div>
                  <div style={{fontSize:11,color:"#475569",fontFamily:"'Barlow',sans-serif",marginBottom:4}}>📍 {ex.machine}</div>
                  <div style={{display:"flex",gap:5,flexWrap:"wrap"}}><Pill color={plan.color}>{ex.sets}×{ex.reps}</Pill>{ex.weightKg>0&&<Pill color="#64748b">{ex.weightKg}kg</Pill>}</div>
                </div>
                <GlowBtn small color={plan.color} onClick={()=>addEx(ex)}>Add</GlowBtn>
              </div>
            ))}
          </>
        )}
        {mode==="ai"&&(
          <>
            <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,padding:"12px",marginBottom:12,fontSize:12,color:"#64748b",fontFamily:"'Barlow',sans-serif",lineHeight:1.6}}>
              Claude analyses what you've done today and suggests 4 complementary exercises — no muscle overlap, back-safe only.
            </div>
            {!aiList.length&&!aiLoad&&<GlowBtn full color="#6366f1" onClick={getAI}>🤖 Generate for {plan.label}</GlowBtn>}
            {aiLoad&&<div style={{textAlign:"center",padding:30,color:"#6366f1",fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:700}}>🤖 Analysing your workout…</div>}
            {aiErr&&<div style={{color:"#ef4444",fontSize:13,padding:10,background:"#1a0a0a",borderRadius:8,fontFamily:"'Barlow',sans-serif"}}>{aiErr}</div>}
            {aiList.map((ex,i)=>(
              <div key={i} style={{background:"#0f172a",border:"1px solid #6366f130",borderRadius:12,padding:"12px",marginBottom:8,display:"flex",alignItems:"center",gap:10}}>
                <MuscleSVG muscle={ex.muscle} size={42}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}><div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:15,fontWeight:700,color:"#f1f5f9"}}>{ex.name}</div><Pill color="#6366f1">AI</Pill></div>
                  <div style={{fontSize:11,color:"#475569",fontFamily:"'Barlow',sans-serif",fontStyle:"italic",marginBottom:4}}>{ex.note}</div>
                  <div style={{display:"flex",gap:5}}><Pill color="#6366f1">{ex.sets}×{ex.reps}</Pill>{ex.weightKg>0&&<Pill color="#64748b">{ex.weightKg}kg</Pill>}</div>
                </div>
                <GlowBtn small color="#6366f1" onClick={()=>addEx(ex)}>Add</GlowBtn>
              </div>
            ))}
            {aiList.length>0&&<button onClick={getAI} style={{marginTop:8,background:"none",border:"1px solid #334155",borderRadius:10,padding:"8px 16px",color:"#64748b",fontSize:12,cursor:"pointer",fontFamily:"'Barlow',sans-serif",width:"100%"}}>↺ Regenerate</button>}
          </>
        )}
      </div>
    </div>
  );
}

function WorkoutCompleteModal({plan,totalCal,earnedCal,duration,onClose}) {
  const now=new Date();
  const startTime=new Date(now-duration*60000);
  const csvData=[["Workout","Date","Start Time","Duration (min)","Calories Burned","Type"],[plan.label,now.toLocaleDateString("en-IN"),startTime.toLocaleTimeString("en-IN"),duration,earnedCal,plan.type==="cardio"?"HKWorkoutActivityTypeRunning":"HKWorkoutActivityTypeTraditionalStrengthTraining"]].map(r=>r.join(",")).join("\n");
  const dlCSV=()=>{const b=new Blob([csvData],{type:"text/csv"});const u=URL.createObjectURL(b);const a=document.createElement("a");a.href=u;a.download=`workout_${todayStr()}.csv`;a.click();URL.revokeObjectURL(u);};
  return (
    <div style={{position:"fixed",inset:0,background:"#000d",zIndex:300,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#0a0f1e",border:"1px solid #1e293b",borderRadius:24,padding:"24px 20px",maxWidth:380,width:"100%",textAlign:"center",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{fontSize:40,marginBottom:6}}>🏆</div>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:26,fontWeight:900,color:plan.color,marginBottom:4}}>WORKOUT DONE</div>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,color:"#64748b",marginBottom:16}}>{plan.day} — {plan.label}</div>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {[{label:"Burned",val:`${earnedCal} kcal`,col:plan.color},{label:"Duration",val:`${duration}min`,col:"#a78bfa"},{label:"Date",val:now.toLocaleDateString("en-IN",{day:"numeric",month:"short"}),col:"#06b6d4"}].map(x=>(
            <div key={x.label} style={{flex:1,background:"#0f172a",borderRadius:10,padding:"10px 6px"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:15,fontWeight:800,color:x.col}}>{x.val}</div>
              <div style={{fontSize:10,color:"#475569",fontFamily:"'Barlow',sans-serif",marginTop:2}}>{x.label}</div>
            </div>
          ))}
        </div>
        <div style={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:12,padding:"14px",marginBottom:12,textAlign:"left"}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:11,color:"#64748b",letterSpacing:1,marginBottom:8}}>APPLE HEALTH SYNC</div>
          <div style={{fontSize:12,color:"#475569",fontFamily:"'Barlow',sans-serif",lineHeight:1.5,marginBottom:10}}>Web apps can't write directly to Apple Health. Use one of these:</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <a href="x-apple-health://" style={{display:"block",background:"linear-gradient(135deg,#ef4444,#dc2626)",borderRadius:10,padding:"10px",color:"#fff",textDecoration:"none",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:13,textAlign:"center"}}>❤️ Open Apple Health</a>
            <div style={{fontSize:11,color:"#475569",textAlign:"center",fontFamily:"'Barlow',sans-serif"}}>Browse → Activity → Workouts → + Add</div>
            <button onClick={dlCSV} style={{background:"#1e293b",border:"1px solid #334155",borderRadius:10,padding:"10px",color:"#94a3b8",fontFamily:"'Barlow',sans-serif",fontWeight:700,fontSize:13,cursor:"pointer"}}>📥 Download CSV (Strong / MyFitnessPal)</button>
          </div>
        </div>
        <div style={{background:"#0f172a",border:"1px solid #1e2535",borderRadius:10,padding:"12px",marginBottom:14,textAlign:"left"}}>
          <div style={{fontSize:11,color:"#6366f1",fontFamily:"'Barlow',sans-serif",letterSpacing:1,marginBottom:4}}>MANUAL ENTRY</div>
          <div style={{fontSize:12,color:"#64748b",fontFamily:"'Barlow',sans-serif",lineHeight:1.8}}>
            Type: <span style={{color:"#f1f5f9"}}>{plan.type==="cardio"?"Cardio":"Strength Training"}</span><br/>
            Duration: <span style={{color:"#f1f5f9"}}>{duration} min</span> · Calories: <span style={{color:plan.color,fontWeight:700}}>{earnedCal} kcal</span><br/>
            Start: <span style={{color:"#f1f5f9"}}>{startTime.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>
          </div>
        </div>
        <GlowBtn full color={plan.color} onClick={onClose}>Close</GlowBtn>
      </div>
    </div>
  );
}

function DayWorkoutView({plan,weights,setWeights,completedSets,setCompletedSets,onBack,onWorkoutFinished}) {
  const [restSec,setRestSec]=useState(null);
  const [showAdd,setShowAdd]=useState(false);
  const [extras,setExtrasState]=useState([]);
  const [showComplete,setShowComplete]=useState(false);
  const [elapsed,setElapsed]=useState(0);
  const [timerOn,setTimerOn]=useState(false);
  const [is90,setIs90]=useState(false);
  const coreExercises = is90 ? [...plan.exercises,...(plan.exercises90||[])] : plan.exercises;

  useEffect(()=>{
    (async()=>{const s=await db.get("extras_"+plan.day+"_"+todayStr())||[];setExtrasState(s);})();
  },[plan.day]);

  useEffect(()=>{
    if(!timerOn)return;
    const t=setInterval(()=>setElapsed(e=>e+1),1000);
    return ()=>clearInterval(t);
  },[timerOn]);

  const setExtras=useCallback((u)=>{
    setExtrasState(p=>{const n=typeof u==="function"?u(p):u;db.set("extras_"+plan.day+"_"+todayStr(),n);return n;});
  },[plan.day]);

  const all=[...coreExercises,...extras];
  const totalCal=workoutCalBurn(all);
  const earnedCal=all.reduce((t,ex)=>{const d=completedSets[ex.id]??0;return t+ex.calPerSet*Math.min(d,typeof ex.sets==="number"?ex.sets:1);},0);
  const totalSets=all.reduce((t,ex)=>t+(typeof ex.sets==="number"?ex.sets:1),0);
  const doneSets=all.reduce((t,ex)=>t+Math.min(completedSets[ex.id]??0,typeof ex.sets==="number"?ex.sets:1),0);
  const pct=Math.round((doneSets/totalSets)*100);
  const elMin=Math.floor(elapsed/60); const elSec=elapsed%60;
  const target=is90||extras.length>0?plan.duration90||90:plan.duration60||60;

  const handleFinish=()=>{
    onWorkoutFinished(earnedCal);
    setShowComplete(true);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
        <button onClick={onBack} style={{background:"#1e293b",border:"none",borderRadius:10,padding:"8px 12px",color:"#94a3b8",fontSize:13,cursor:"pointer",fontFamily:"'Barlow',sans-serif"}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:800,color:plan.color}}>{plan.day} — {plan.label}</div>
          <div style={{fontSize:11,color:"#475569",fontFamily:"'Barlow',sans-serif"}}>{plan.tagline}</div>
        </div>
        <div style={{display:"flex",background:"#1e293b",borderRadius:10,padding:2,flexShrink:0}}>
          {["60","90"].map(m=>(
            <button key={m} onClick={()=>setIs90(m==="90")} style={{padding:"5px 10px",border:"none",borderRadius:8,background:(is90&&m==="90")||(!is90&&m==="60")?plan.color:"transparent",color:(is90&&m==="90")||(!is90&&m==="60")?"#fff":"#64748b",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:800,fontSize:13,cursor:"pointer",letterSpacing:0.5}}>{m}m</button>
          ))}
        </div>
        <button onClick={()=>setTimerOn(a=>!a)} style={{background:timerOn?"#10b98120":"#1e293b",border:`1px solid ${timerOn?"#10b981":"#334155"}`,borderRadius:10,padding:"7px 10px",color:timerOn?"#10b981":"#64748b",fontSize:12,cursor:"pointer",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,minWidth:56,textAlign:"center"}}>
          {timerOn?`${elMin}:${String(elSec).padStart(2,"0")}`:"▶ START"}
        </button>
      </div>

      <div style={{background:"#1e293b",borderRadius:16,padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:14}}>
        <div style={{flex:1}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
            <span style={{fontSize:11,color:"#64748b",fontFamily:"'Barlow',sans-serif"}}>{doneSets}/{totalSets} sets · {pct}%</span>
            <span style={{fontSize:11,color:"#64748b",fontFamily:"'Barlow',sans-serif"}}>Target {target}min</span>
          </div>
          <div style={{background:"#0f172a",borderRadius:8,height:7}}>
            <div style={{width:`${pct}%`,height:"100%",background:`linear-gradient(90deg,${plan.color},${plan.color}99)`,borderRadius:8,transition:"width .4s"}}/>
          </div>
        </div>
        <div style={{textAlign:"center"}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:800,color:plan.color}}>{earnedCal}</div>
          <div style={{fontSize:10,color:"#475569",fontFamily:"'Barlow',sans-serif"}}>/{totalCal} kcal</div>
        </div>
      </div>

      {coreExercises.map(ex=>(
        <WorkoutExCard key={ex.id} ex={ex} dayColor={plan.color} weights={weights} setWeights={setWeights} completedSets={completedSets} setCompletedSets={setCompletedSets} onRestStart={setRestSec}/>
      ))}

      {extras.length>0&&(
        <>
          <div style={{display:"flex",alignItems:"center",gap:10,margin:"14px 0 10px"}}>
            <div style={{flex:1,height:1,background:"#1e293b"}}/><div style={{fontSize:11,color:"#6366f1",fontFamily:"'Barlow',sans-serif",letterSpacing:2,fontWeight:700}}>+ 90 MIN EXTENSION</div><div style={{flex:1,height:1,background:"#1e293b"}}/>
          </div>
          {extras.map((ex,i)=>(
            <WorkoutExCard key={ex.id} ex={ex} dayColor="#6366f1" weights={weights} setWeights={setWeights} completedSets={completedSets} setCompletedSets={setCompletedSets} onRestStart={setRestSec} onRemove={()=>setExtras(p=>p.filter((_,j)=>j!==i))}/>
          ))}
        </>
      )}

      <div style={{display:"flex",gap:10,marginTop:14,marginBottom:8}}>
        <button onClick={()=>setShowAdd(true)} style={{flex:1,background:"#0a0d16",border:"2px dashed #334155",borderRadius:14,padding:"13px 0",color:"#64748b",fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,fontSize:14,cursor:"pointer",letterSpacing:1}}>+ ADD MORE</button>
        <GlowBtn color={plan.color} onClick={handleFinish} style={{flexShrink:0,padding:"13px 18px"}}>✓ Finish</GlowBtn>
      </div>

      <div style={{background:"#1e293b",borderRadius:14,padding:"14px 16px"}}>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,color:"#64748b",letterSpacing:1,marginBottom:8}}>SUMMARY</div>
        <div style={{display:"flex",gap:8}}>
          {[{l:"Exercises",v:all.length},{l:"Total Sets",v:totalSets},{l:"Est. kcal",v:`~${totalCal}`},{l:"Duration",v:`${target}m`}].map(x=>(
            <div key={x.l} style={{flex:1,background:"#0f172a",borderRadius:8,padding:"8px 6px",textAlign:"center"}}>
              <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:15,fontWeight:700,color:plan.color}}>{x.v}</div>
              <div style={{fontSize:9,color:"#475569",fontFamily:"'Barlow',sans-serif",marginTop:2}}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>

      {restSec&&<RestTimer seconds={restSec} onDone={()=>setRestSec(null)}/>}
      {showAdd&&<AddExercisePanel plan={plan} extraExercises={extras} setExtraExercises={setExtras} weights={weights} setWeights={setWeights} onClose={()=>setShowAdd(false)}/>}
      {showComplete&&<WorkoutCompleteModal plan={plan} totalCal={totalCal} earnedCal={earnedCal} duration={timerOn?elMin:target} onClose={()=>{setShowComplete(false);setTimerOn(false);onBack();}}/>}
    </div>
  );
}

function WorkoutTab({weights,setWeights,completedSets,setCompletedSets,profile,onWorkoutFinished}) {
  const [selected,setSelected]=useState(null);
  const today=["SUN","MON","TUE","WED","THU","FRI","SAT"][new Date().getDay()];
  const bodyWeight=parseFloat(profile?.weight)||81;
  const weeklyTotal=WEEKLY_PLAN.reduce((t,p)=>t+workoutCalBurn(p.exercises),0);

  if(selected) return <DayWorkoutView plan={selected} weights={weights} setWeights={setWeights} completedSets={completedSets} setCompletedSets={setCompletedSets} onBack={()=>setSelected(null)} onWorkoutFinished={onWorkoutFinished}/>;

  return (
    <>
      <div style={{background:"linear-gradient(135deg,#1a0a2e,#0a1628)",border:"1px solid #1e293b",borderRadius:18,padding:"18px 20px",marginBottom:16}}>
        <div style={{fontSize:11,color:"#475569",fontFamily:"'Barlow',sans-serif",letterSpacing:2,marginBottom:4}}>WEEKLY BURN ESTIMATE</div>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:44,fontWeight:900,color:"#fff",lineHeight:1}}>
          {weeklyTotal} <span style={{fontSize:18,color:"#475569"}}>kcal</span>
        </div>
        <div style={{fontSize:12,color:"#475569",fontFamily:"'Barlow',sans-serif",marginTop:4}}>≈ {(weeklyTotal/7700).toFixed(2)} kg fat · 60min base · {bodyWeight}kg body weight</div>
      </div>

      {WEEKLY_PLAN.map(plan=>{
        const cal=workoutCalBurn(plan.exercises);
        const ts=plan.exercises.reduce((t,ex)=>t+(typeof ex.sets==="number"?ex.sets:1),0);
        const ds=plan.exercises.reduce((t,ex)=>t+Math.min(completedSets[ex.id]??0,typeof ex.sets==="number"?ex.sets:1),0);
        const pct=Math.round((ds/ts)*100);
        const isToday=plan.day===today;
        return (
          <div key={plan.day} onClick={()=>setSelected(plan)} style={{background:"#0f172a",border:`1px solid ${isToday?plan.color+"80":"#1e293b"}`,borderRadius:14,padding:"14px 16px",marginBottom:8,cursor:"pointer",position:"relative",overflow:"hidden"}}>
            {isToday&&<div style={{position:"absolute",top:0,left:0,right:0,height:2,background:`linear-gradient(90deg,${plan.color},transparent)`}}/>}
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:46,height:46,borderRadius:12,background:`${plan.color}20`,border:`2px solid ${plan.color}50`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:800,color:plan.color}}>{plan.day}</span>
              </div>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:17,fontWeight:700,color:"#f1f5f9"}}>{plan.label}</div>
                  {isToday&&<Pill color={plan.color}>TODAY</Pill>}
                </div>
                <div style={{fontSize:11,color:"#475569",fontFamily:"'Barlow',sans-serif",marginBottom:5}}>{plan.tagline}</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <div style={{flex:1,background:"#1e293b",borderRadius:4,height:4}}><div style={{width:`${pct}%`,height:"100%",background:plan.color,borderRadius:4,transition:"width .3s"}}/></div>
                  <span style={{fontSize:11,color:plan.color,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,minWidth:26}}>{pct}%</span>
                </div>
              </div>
              <div style={{textAlign:"right",flexShrink:0}}>
                <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:17,fontWeight:800,color:plan.color}}>{cal}</div>
                <div style={{fontSize:9,color:"#475569",fontFamily:"'Barlow',sans-serif"}}>kcal · {plan.duration60||60}-{plan.duration90||90}m</div>
              </div>
            </div>
          </div>
        );
      })}
      <div style={{background:"#0f172a",border:"1px solid #1e2535",borderRadius:12,padding:"12px 14px",marginTop:6}}>
        <div style={{fontSize:11,color:"#6366f1",fontFamily:"'Barlow',sans-serif",letterSpacing:1,marginBottom:4}}>⚡ PROGRESSIVE OVERLOAD</div>
        <div style={{fontSize:12,color:"#475569",fontFamily:"'Barlow',sans-serif",lineHeight:1.6}}>Add <strong style={{color:"#f1f5f9"}}>2.5kg</strong> once you complete all reps perfectly for <strong style={{color:"#f1f5f9"}}>2 consecutive sessions</strong>. Weights save permanently.</div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TRENDS TAB
// ══════════════════════════════════════════════════════════════════════════════
function TrendsTab({history}) {
  const entries=Object.entries(history).sort(([a],[b])=>a.localeCompare(b)).slice(-30);
  const weightData=entries.filter(([,v])=>v.weight).map(([k,v])=>({date:k.slice(5),weight:parseFloat(v.weight)}));
  const netData=entries.map(([k,v])=>({date:k.slice(5),net:v.net||0}));

  if(!entries.length) return (
    <Card><div style={{textAlign:"center",color:"#475569",padding:40,fontFamily:"'Barlow',sans-serif"}}>No data yet. Log your weight daily to see trends.</div></Card>
  );
  return (
    <>
      <Card>
        <SLabel>Weight (kg) — Last 30 days</SLabel>
        {weightData.length>1?(
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={weightData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
              <XAxis dataKey="date" tick={{fill:"#475569",fontSize:10}}/>
              <YAxis tick={{fill:"#475569",fontSize:10}} domain={["auto","auto"]}/>
              <Tooltip contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,color:"#e2e8f0",fontSize:12}}/>
              <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2.5} dot={{fill:"#6366f1",r:3}}/>
            </LineChart>
          </ResponsiveContainer>
        ):<div style={{color:"#64748b",fontSize:13,fontFamily:"'Barlow',sans-serif"}}>Need at least 2 days of weight data.</div>}
      </Card>
      <Card>
        <SLabel>Net Calories — Last 30 days</SLabel>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={netData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b"/>
            <XAxis dataKey="date" tick={{fill:"#475569",fontSize:10}}/>
            <YAxis tick={{fill:"#475569",fontSize:10}}/>
            <Tooltip contentStyle={{background:"#0f172a",border:"1px solid #1e293b",borderRadius:10,color:"#e2e8f0",fontSize:12}} formatter={v=>[`${v} kcal`,"Net"]}/>
            <Line type="monotone" dataKey="net" stroke="#fb923c" strokeWidth={2.5} dot={{fill:"#fb923c",r:3}}/>
          </LineChart>
        </ResponsiveContainer>
      </Card>
      <Card>
        <SLabel>Summary</SLabel>
        {(()=>{
          const avgNet=entries.reduce((a,[,v])=>a+(v.net||0),0)/entries.length;
          const totalEst=entries.reduce((a,[,v])=>a+(v.net||0),0)/7700;
          return (
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              {[{label:"Days tracked",val:entries.length,col:"#a78bfa"},{label:"Avg net kcal/day",val:Math.round(avgNet),col:avgNet>0?"#fb923c":"#4ade80"},{label:"Est. total Δ kg",val:totalEst.toFixed(2),col:totalEst>0?"#fb923c":"#4ade80"}].map(x=>(
                <div key={x.label} style={{flex:1,minWidth:80,background:"#0a0d16",borderRadius:10,padding:"12px 8px",textAlign:"center"}}>
                  <div style={{fontSize:18,fontWeight:700,color:x.col,fontFamily:"'Barlow Condensed',sans-serif"}}>{x.val}</div>
                  <div style={{fontSize:10,color:"#64748b",fontFamily:"'Barlow',sans-serif",marginTop:3}}>{x.label}</div>
                </div>
              ))}
            </div>
          );
        })()}
      </Card>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PROFILE TAB
// ══════════════════════════════════════════════════════════════════════════════
function ProfileTab({profile,saveProfile}) {
  const [p,setP]=useState(profile);
  const b=bmi(p.weight,p.height);
  const bl=bmiLabel(b);
  const upd=(k,v)=>setP(prev=>({...prev,[k]:v}));
  return (
    <>
      <Card>
        <SLabel>Personal Info</SLabel>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[{label:"Name",key:"name",type:"text",ph:"Your name",full:true},{label:"Age",key:"age",type:"number",ph:"30"},{label:"Height (cm)",key:"height",type:"number",ph:"171"},{label:"Current Weight (kg)",key:"weight",type:"number",ph:"81"},{label:"Target Weight (kg)",key:"targetWeight",type:"number",ph:"72"}].map(f=>(
            <div key={f.key} style={f.full?{gridColumn:"1/-1"}:{}}>
              <SLabel>{f.label}</SLabel>
              <SInput type={f.type} placeholder={f.ph} value={p[f.key]||""} onChange={e=>upd(f.key,e.target.value)}/>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <SLabel>Body Metrics</SLabel>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",marginBottom:16}}>
          {[{label:"BMI",val:b,col:bl.col,sub:bl.text},{label:"To Goal",val:p.weight&&p.targetWeight?(parseFloat(p.weight)-parseFloat(p.targetWeight)).toFixed(1)+" kg":"—",col:"#60a5fa"},{label:"Height",val:p.height?p.height+" cm":"—",col:"#a78bfa"}].map(x=>(
            <div key={x.label} style={{flex:1,minWidth:80,background:"#0a0d16",borderRadius:10,padding:"14px 8px",textAlign:"center"}}>
              <div style={{fontSize:20,fontWeight:700,color:x.col,fontFamily:"'Barlow Condensed',sans-serif"}}>{x.val}</div>
              {x.sub&&<div style={{fontSize:11,color:x.col,marginTop:2,fontFamily:"'Barlow',sans-serif"}}>{x.sub}</div>}
              <div style={{fontSize:10,color:"#64748b",fontFamily:"'Barlow',sans-serif",marginTop:4}}>{x.label}</div>
            </div>
          ))}
        </div>
        {b!=="—"&&(
          <div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#475569",fontFamily:"'Barlow',sans-serif",marginBottom:4}}>
              <span>15</span><span>18.5</span><span>25</span><span>30</span><span>40</span>
            </div>
            <div style={{position:"relative",height:10,borderRadius:8,background:"linear-gradient(90deg,#60a5fa 0%,#4ade80 30%,#fb923c 65%,#f87171 100%)"}}>
              <div style={{position:"absolute",top:-2,width:14,height:14,borderRadius:"50%",background:"#fff",border:"2px solid #0a0d16",left:`${Math.min(95,Math.max(2,((parseFloat(b)-15)/25)*100))}%`,transform:"translateX(-50%)",transition:"left .5s"}}/>
            </div>
          </div>
        )}
        <div style={{marginTop:14,padding:"12px 14px",background:"#0a0d16",borderRadius:10,fontSize:12,color:"#64748b",fontFamily:"'Barlow',sans-serif",lineHeight:1.7}}>
          ⚡ Your body weight (<strong style={{color:"#f1f5f9"}}>{p.weight}kg</strong>) drives calorie estimates in both the workout planner and the cardio calculator — update here after each weigh-in for accuracy.
        </div>
      </Card>
      <GlowBtn full onClick={()=>saveProfile(p)} style={{marginBottom:8}}>Save Profile</GlowBtn>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════════════════════════════════════════════
export default function ForgeApp() {
  const [tab,setTab]=useState("today");
  const [profile,setProfileState]=useState(null);
  const [dayData,setDayDataState]=useState(null);
  const [history,setHistory]=useState({});
  const [wWeights,setWWeightsState]=useState({});
  const [wCompleted,setWCompletedState]=useState({});
  const [workoutBurnToday,setWorkoutBurnToday]=useState(0);
  const [loaded,setLoaded]=useState(false);

  useEffect(()=>{
    (async()=>{
      const p  = await db.get("profile")                          || emptyProfile();
      const d  = await db.get("day_"+todayStr())                  || emptyDay();
      const h  = await db.get("history")                          || {};
      const ww = await db.get("workout_weights")                  || {};
      const wc = await db.get("workout_completed_"+todayStr())    || {};
      const wb = await db.get("workout_burn_"+todayStr())         || 0;
      const defaults={};
      WEEKLY_PLAN.forEach(pl=>{
        pl.exercises.forEach(ex=>{defaults[ex.id]=ex.weightKg;});
        (pl.exercises90||[]).forEach(ex=>{defaults[ex.id]=ex.weightKg;});
      });
      setProfileState(p);
      setDayDataState(d);
      setHistory(h);
      setWWeightsState({...defaults,...ww});
      setWCompletedState(wc);
      setWorkoutBurnToday(wb);
      setLoaded(true);
    })();
  },[]);

  const saveDay=useCallback(async(d)=>{
    setDayDataState(d);
    // Write day data first — guaranteed persist before anything else
    await db.set("day_"+todayStr(), d);
    const net = netCalories(d, workoutBurnToday);
    // Read current history from storage directly (avoids stale closure)
    const currentHistory = await db.get("history") || {};
    const h2 = {
      ...currentHistory,
      [todayStr()]: {
        weight: d.weight || currentHistory[todayStr()]?.weight || "",
        net,
      }
    };
    await db.set("history", h2);  // awaited — guaranteed write
    setHistory(h2);
  },[workoutBurnToday]);

  const saveProfile=useCallback(async(p)=>{
    setProfileState(p);
    await db.set("profile",p);
  },[]);

  const setWWeights=useCallback((u)=>{
    setWWeightsState(p=>{
      const n=typeof u==="function"?u(p):u;
      // Fire immediately — weights are low-stakes, best-effort is fine
      db.set("workout_weights",n);
      return n;
    });
  },[]);

  const setWCompleted=useCallback((u)=>{
    setWCompletedState(p=>{
      const n=typeof u==="function"?u(p):u;
      // Completed sets — write immediately on every set tap
      db.set("workout_completed_"+todayStr(),n);
      return n;
    });
  },[]);

  const onWorkoutFinished=useCallback(async(burn)=>{
    setWorkoutBurnToday(burn);
    await db.set("workout_burn_"+todayStr(), burn);
    // Read both day and history directly from storage — no stale closure risk
    const currentDay = await db.get("day_"+todayStr()) || emptyDay();
    const currentHistory = await db.get("history") || {};
    const net = netCalories(currentDay, burn);
    const h2 = {
      ...currentHistory,
      [todayStr()]: {
        weight: currentDay.weight || currentHistory[todayStr()]?.weight || "",
        net,
      }
    };
    await db.set("history", h2);  // awaited — guaranteed write
    setHistory(h2);
  },[]);

  if(!loaded) return <div style={{background:"#030712",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",color:"#475569",fontFamily:"'Barlow',sans-serif",fontSize:16}}>Loading…</div>;


  const today=["SUN","MON","TUE","WED","THU","FRI","SAT"][new Date().getDay()];
  const todayPlan=WEEKLY_PLAN.find(p=>p.day===today);

  const TABS=[
    {id:"today",icon:"🏠",label:"Today"},
    {id:"workout",icon:"💪",label:"Workout"},
    {id:"trends",icon:"📈",label:"Trends"},
    {id:"profile",icon:"👤",label:"Profile"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#030712",color:"#f1f5f9"}}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@600;700;800;900&display=swap" rel="stylesheet"/>

      {/* Header */}
      <div style={{background:"#0a0f1e",borderBottom:"1px solid #1e293b",padding:"14px 0",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:640,margin:"0 auto",padding:"0 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900,color:"#fff",letterSpacing:1}}>
              FORGE <span style={{color:"#f97316"}}>FIT</span>
            </div>
            <div style={{fontSize:10,color:"#334155",fontFamily:"'Barlow',sans-serif",letterSpacing:2}}>{profile?.name?.toUpperCase()} · {profile?.weight}KG → {profile?.targetWeight}KG</div>
          </div>
          <div style={{textAlign:"right"}}>
            {todayPlan&&(
              <div style={{fontSize:11,color:todayPlan.color,fontFamily:"'Barlow Condensed',sans-serif",fontWeight:700,letterSpacing:1}}>{todayPlan.label.toUpperCase()}</div>
            )}
            <div style={{fontSize:11,color:"#334155",fontFamily:"'Barlow',sans-serif"}}>{new Date().toLocaleDateString("en-IN",{day:"numeric",month:"short"})}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{maxWidth:640,margin:"0 auto",padding:"18px 16px 90px"}}>
        {tab==="today"&&<TodayTab dayData={dayData} saveDay={saveDay} profile={profile} workoutBurnToday={workoutBurnToday}/>}
        {tab==="workout"&&<WorkoutTab weights={wWeights} setWeights={setWWeights} completedSets={wCompleted} setCompletedSets={setWCompleted} profile={profile} onWorkoutFinished={onWorkoutFinished}/>}
        {tab==="trends"&&<TrendsTab history={history}/>}
        {tab==="profile"&&<ProfileTab profile={profile} saveProfile={saveProfile}/>}
      </div>

      {/* Bottom Nav */}
      <div style={{position:"fixed",bottom:0,left:0,right:0,background:"#0a0f1e",borderTop:"1px solid #1e293b",zIndex:100}}>
        <div style={{maxWidth:640,margin:"0 auto",display:"flex"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"12px 0 10px",border:"none",background:"transparent",color:tab===t.id?"#f97316":"#475569",fontFamily:"'Barlow',sans-serif",fontWeight:600,fontSize:11,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"color .2s"}}>
              <span style={{fontSize:18}}>{t.icon}</span>
              <span style={{letterSpacing:0.5}}>{t.label}</span>
              {tab===t.id&&<div style={{width:20,height:2,background:"#f97316",borderRadius:2}}/>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
