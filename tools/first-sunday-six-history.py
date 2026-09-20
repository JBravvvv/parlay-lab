"""Rebuild First Sunday Six historical audit from nflverse CSV release files.
Usage: python3 tools/first-sunday-six-history.py INPUT_DIR OUTPUT_DIR
Input: play_by_play_2016.csv.gz ... 2026, games.csv, players.csv.
No bookmaker prices or future outcomes enter historical clock estimates.
"""
import csv,gzip,json,hashlib,sys,statistics,collections,datetime,os,math
root,out=sys.argv[1:]; os.makedirs(out,exist_ok=True)
schedules={r['game_id']:r for r in csv.DictReader(open(root+'/games.csv')) if 2016<=int(r['season'])<=2026 and r['game_type'] in ('REG','WC','DIV','CON','SB') and r['home_score']!='' and (int(r['season'])<2026 or int(r['week'])<=2)}
players={r['gsis_id']:r for r in csv.DictReader(open(root+'/players.csv'))}
rows=[]; sources=[]; coverage=[]
def clock(s):
 try:
  m,se=map(int,s.split(':'));return m*60+se if 0<=m<=15 and 0<=se<60 and m*60+se<=900 else None
 except: return None
for year in range(2016,2027):
 path=f'{root}/play_by_play_{year}.csv.gz'; sources.append({'file':os.path.basename(path),'sha256':hashlib.sha256(open(path,'rb').read()).hexdigest()})
 seen=set(); first={}; counts=collections.Counter()
 with gzip.open(path,'rt') as f:
  for r in csv.DictReader(f):
   gid=r['game_id']
   if gid not in schedules: continue
   seen.add(gid)
   if r.get('touchdown')!='1' or r.get('play_type')=='no_play':continue
   counts[gid]+=1
   if gid in first: continue
   q=int(float(r['qtr'])); end=clock(r.get('drive_game_clock_end',''));start=clock(r.get('time',''))
   valid=end is not None and start is not None and end<=start
   period_length=600 if year>=2017 and schedules[gid]['game_type']=='REG' else 900
   elapsed=((q-1)*900+900-end if q<=4 else 3600+(q-5)*period_length+period_length-end) if valid else None
   p=players.get(r.get('td_player_id'),{})
   first[gid]={'playerId':r.get('td_player_id',''),'player':p.get('display_name') or r.get('td_player_name',''),'position':p.get('position',''),'tdTeam':r.get('td_team',''),'type':'return' if r.get('return_touchdown')=='1' else 'rush' if r.get('rush_touchdown')=='1' else 'pass' if r.get('pass_touchdown')=='1' else 'other','quarter':q,'clock':r.get('drive_game_clock_end','') if valid else '', 'elapsed':elapsed,'clockSource':'drive_game_clock_end' if valid else 'unavailable','snapClock':r.get('time','')}
 for gid,s in schedules.items():
  if int(s['season'])!=year:continue
  base={'gameId':gid,'season':year,'week':int(s['week']),'gameType':s['game_type'],'date':s['gameday'],'kickoffET':s['gametime'],'away':s['away_team'],'home':s['home_team'],'totalLine':float(s['total_line']) if s['total_line'] else None,'earlySunday':s['weekday']=='Sunday' and s['gametime']=='13:00' and s['game_type']=='REG','status':'first_td' if gid in first else 'no_td' if gid in seen else 'missing_pbp'}
  base.update(first.get(gid,dict(playerId='',player='',position='',tdTeam='',type='',quarter=None,clock='',elapsed=None,clockSource='',snapClock='')));rows.append(base)
 seasonrows=[r for r in rows if r['season']==year]
 coverage.append({'season':year,'completedGames':len(seasonrows),'pbpGames':len(seen),'firstTDs':sum(r['status']=='first_td' for r in seasonrows),'noTD':sum(r['status']=='no_td' for r in seasonrows),'unknownClock':sum(r['status']=='first_td' and r['elapsed'] is None for r in seasonrows),'unknownScorer':sum(r['status']=='first_td' and not r['player'] for r in seasonrows)})
 print(coverage[-1],flush=True)
slates=[]
for date in sorted({r['date'] for r in rows if r['earlySunday']}):
 games=[r for r in rows if r['earlySunday'] and r['date']==date]
 valid=all(r['status']=='no_td' or r['elapsed'] is not None for r in games)
 timed=[r for r in games if r['elapsed'] is not None]
 earliest=min((r['elapsed'] for r in timed),default=None)
 winners=[r for r in timed if r['elapsed']==earliest] if valid else []
 slates.append({'date':date,'season':games[0]['season'],'week':games[0]['week'],'games':len(games),'complete':valid,'elapsed':earliest if valid else None,'winnerGames':'|'.join(r['gameId'] for r in winners),'scorers':'|'.join(r['player'] for r in winners),'teams':'|'.join(r['tdTeam'] for r in winners),'tieCount':len(winners)})
# Empirical first-TD clocks, not assumed exponential clocks. No-TD games are censored at regulation end.
training=[r for r in rows if r['gameType']=='REG' and (r['elapsed'] is not None or r['status']=='no_td')]
hist=collections.Counter(r['elapsed'] if r['elapsed'] is not None else 3601 for r in training)
def band(t): return 'low' if t<42 else 'high' if t>=48 else 'mid'
def distributions(data):
 pool=collections.Counter(min(r['elapsed'],3601) if r['elapsed'] is not None else 3601 for r in data)
 buckets={b:collections.Counter(min(r['elapsed'],3601) if r['elapsed'] is not None else 3601 for r in data if r['totalLine'] is not None and band(r['totalLine'])==b) for b in ('low','mid','high')}
 n=sum(pool.values())
 return {b:{t:(c.get(t,0)+50*count/n)/(sum(c.values())+50) for t,count in pool.items()} for b,c in buckets.items()},pool

def race_probs(games,dis):
 ds=[dis[band(r['totalLine'])] for r in games]; surv=[1.]*len(ds);wins=[0.]*len(ds)
 for t in sorted(set().union(*(d.keys() for d in ds))):
  if t>3600:continue
  mass=[d.get(t,0) for d in ds]
  surv=[max(0,s-m) for s,m in zip(surv,mass)]
  for i,m in enumerate(mass):wins[i]+=m*math.prod(s for j,s in enumerate(surv) if i!=j)
 total=sum(wins)
 return [w/total for w in wins] if total else [1/len(ds)]*len(ds)

def evaluate(train,endyears):
 dis,_=distributions(train); scores={'uniform':[],'totalBands':[]}
 for slate in slates:
  if slate['season'] not in endyears or slate['tieCount']!=1 or not slate['complete']:continue
  gs=[r for r in training if r['earlySunday'] and r['date']==slate['date']]
  if not gs or any(r['totalLine'] is None for r in gs):continue
  winner=next((i for i,r in enumerate(gs) if r['gameId']==slate['winnerGames']),None)
  if winner is None:continue
  for name,ps in [('uniform',[1/len(gs)]*len(gs)),('totalBands',race_probs(gs,dis))]:
   scores[name].append((-math.log(max(ps[winner],1e-12)),sum((p-(i==winner))**2 for i,p in enumerate(ps))))
 return {k:{'slates':len(v),'logLoss':sum(x[0] for x in v)/len(v),'brier':sum(x[1] for x in v)/len(v)} for k,v in scores.items()}
selection=evaluate([r for r in training if r['season']<=2021],{2022,2023})
selected=min(selection,key=lambda k:selection[k]['logLoss'])
holdout=evaluate([r for r in training if r['season']<=2023],{2024,2025,2026})
dis,pool=distributions(training)
candidate=selected
selected=candidate if holdout[candidate]['logLoss']<holdout['uniform']['logLoss'] else 'uniform'
clock_model={'candidate':candidate,'selected':selected,'releaseGate':'Use total bands only if held-out log loss beats equal-game baseline','selection':selection,'holdout':holdout,'bands':{k:sorted(v.items()) for k,v in dis.items()},'pooled':[[t,c/sum(pool.values())] for t,c in sorted(pool.items())]}
summary={'generatedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'through':'2026 Week 2 completed games in source snapshot','source':'nflverse play-by-play, schedules and player data','sourceUrl':'https://github.com/nflverse/nflverse-data','scope':'Regular season and postseason. Preseason excluded. Current Week 2 is incomplete.','coverage':coverage,'games':len(rows),'firstTDs':sum(r['status']=='first_td' for r in rows),'earlySlates':len(slates),'tiedSlates':sum(r['tieCount']>1 for r in slates),'latestCompletedDate':max(r['date'] for r in rows),'medianFirstTDSeconds':statistics.median(r['elapsed'] for r in training if r['elapsed'] is not None),'positionCounts':dict(collections.Counter(r['position'] or 'Unknown' for r in training if r['status']=='first_td')),'clockHistogram':sorted(hist.items()),'sources':sources,'clockModel':clock_model,'playerHistory':[{'player':name,'firstTDs':len(rs),'earlySlateWins':sum(name in slate['scorers'].split('|') for slate in slates),'fastestSeconds':min((r['elapsed'] for r in rs if r['elapsed'] is not None),default=None)} for name,rs in sorted(((name,[r for r in rows if r['player']==name]) for name in {r['player'] for r in rows if r['player']}))],'validation':{'status':'descriptive only; no historical First TD prices available','playerProbabilityCalibrated':False,'ticketROIBacktested':False}}
for name,data in [('first-td-games',rows),('early-sunday-winners',slates)]:
 with open(out+'/'+name+'.csv','w') as f:
  w=csv.DictWriter(f,fieldnames=list(data[0]));w.writeheader();w.writerows(data)
with open(out+'/history.json','w') as f:json.dump(summary,f,separators=(',',':'))
print(json.dumps({k:v for k,v in summary.items() if k not in ('clockHistogram','clockModel','playerHistory','sources')},indent=2))
