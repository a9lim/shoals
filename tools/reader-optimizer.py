"""02a The reader, schema 16: deterministic exact integer-day penalized MLE.
Training-quantile hinge bases, Hessian preconditioning, mandatory convergence.
Only NumPy/SciPy offline; the game evaluates the same basis in public-record.js.
"""
import json
import hashlib
import sys
from pathlib import Path
import numpy as np
from scipy.optimize import minimize
from scipy.linalg import solve_triangular

root = Path(sys.argv[1])
meta = json.loads((root / 'meta.json').read_text())
stage = sys.argv[2] if len(sys.argv) > 2 else 'all'
if stage != 'all':
    raise ValueError(f'Unknown reader fit stage {stage}')
lambda_grid = [1e-9, 1e-8, 1e-7, 1e-6, 1e-5]
L = meta['layout']   # the encoded sample's columns (tools/reader-data.mjs SAMPLE_LAYOUT)
data = {k: np.fromfile(root / f'{k}.bin', dtype='<f8').reshape(meta[k]['rows'], meta[k]['columns']) for k in ['train', 'validation']}
bins = [0, 21, 63, 126, 252, 504, 1000000]
models = {str(r): {} for r in [2, 3, 4, 5, 'family']}
bases = {}
report = {'optimizer': [], 'heads': {}, 'basis': 'Schema 16: the full heads read the demonstration chain; unchanged grid/offset raw hazard MLE; increment-guarded scale-space calibration with one-sided disappearing-segment limits and pooled prior.'}
report.update({'stage': stage, 'lambdaGrid': lambda_grid, 'candidateScores': {},
               'zeroLambda': 'If validation keeps selecting the descending grid through 1e-14, also fit zero. A rank-safe preconditioner changes coordinates only; no ridge is added to the objective.'})
diagnostic_candidates = {}
def raw_features(a, r, kind):
    if kind == 'prior':
        return np.column_stack([a[:, 2] / 1008, np.full(len(a), int(r))])
    leg = a[:, L['family']:L['common']] if r == 'family' else a[:, L['legs']+(int(r)-2)*5:L['legs']+5+(int(r)-2)*5]
    return np.column_stack([leg, a[:, L['common']:L['rules']]]) if kind == 'full' else leg.copy()

def knots(v, positive=False):
    if positive:
        v = v[v > 0]
    if not len(v):
        return []
    lo, hi = np.min(v), np.max(v)
    return sorted(set(float(f'{x:.7g}') for x in np.quantile(v, [.1, .5, .9]) if lo < x < hi))

def make_basis(a, r):
    raw = raw_features(a, r, 'full')
    ids = range(8) if r == 'family' else range(4)
    age_ids = [j for j, name in enumerate(meta['features'][str(r)]['full']) if '.claimAge' in name]
    return {'legible': [[j, knots(raw[:, j])] for j in ids], 'ages': [[j, knots(raw[:, j], True)] for j in age_ids],
            'clock': [day / 1008 for day in meta['clockDays']]}

def features(a, r, kind):
    raw = raw_features(a, r, kind)
    if kind == 'prior':
        quantiles = next(ks for j, ks in bases[str(r)]['legible'] if j == 3)
        return np.column_stack([raw] + [np.maximum(0, raw[:, 0]-k) for k in quantiles+bases[str(r)]['clock']])
    n = 8 if r == 'family' else 5
    leg = [raw[:, j] for j in range(n)]
    for j, ks in bases[str(r)]['legible']:
        leg.extend(np.maximum(0, raw[:, j]-k) for k in ks)
    clock = raw[:, 7 if r == 'family' else 3]
    leg.extend(np.maximum(0, clock-k) for k in bases[str(r)]['clock'])
    if kind == 'legible':
        return np.column_stack(leg)
    columns = leg + [raw[:, j] for j in range(n, raw.shape[1])]
    for j, ks in bases[str(r)]['ages']:
        columns.extend(np.maximum(0, raw[:, j]-k) for k in ks)
    return np.column_stack(columns)

def names(r, kind):
    if kind == 'prior':
        quantiles = next(ks for j, ks in bases[str(r)]['legible'] if j == 3)
        return meta['features'][str(r)][kind][:2] + [f'clock.hinge{k+1}' for k in range(len(quantiles))] + [f'clock.lock{day}' for day in meta['clockDays']]
    base = meta['features'][str(r)]['legible'] if r == 'family' else meta['features'][str(r)]['full'][:5]
    leg = base.copy()
    for j, ks in bases[str(r)]['legible']:
        leg.extend(f'{base[j]}.hinge{k+1}' for k in range(len(ks)))
    leg.extend(f'clock.lock{day}' for day in meta['clockDays'])
    if kind == 'legible':
        return leg
    full = meta['features'][str(r)]['full']
    out = leg + full[len(base):]
    for j, ks in bases[str(r)]['ages']:
        out.extend(f'{full[j]}.hinge{k+1}' for k in range(len(ks)))
    return out

def design(raw, mean=None, scale=None):
    if mean is None:
        mean = raw.mean(axis=0)
        scale = raw.std(axis=0)
        scale[scale < 1e-8] = 1
    return np.column_stack([np.ones(len(raw)), (raw-mean)/scale]), mean, scale

def lengths(a, r):
    duration = a[:, int(r)+3]-a[:, 2]
    support = (1260 if int(r) == 5 else 1008)-a[:, 2]
    event = (duration > 0) & (duration <= support)
    before = np.where(event, duration-1, support)
    e = np.column_stack([np.maximum(0, np.minimum(before, bins[k+1])-bins[k]) for k in range(6)])
    y = np.column_stack([event & (duration > bins[k]) & (duration <= bins[k+1]) for k in range(6)]).astype(float)
    return e, y

def precondition(X, curvature, penalty, n):
    H = X.T @ (curvature[:, None]*X)/n
    H.flat[::H.shape[0]+1] += penalty
    try:
        L = np.linalg.cholesky(H)
        A = solve_triangular(L.T, np.eye(len(L)), lower=False)
    except np.linalg.LinAlgError:
        # Roundoff can erase a tiny ridge in a collinear basis. The eigenvalue
        # floor is ONLY for the invertible coordinate transform A. P below
        # still represents the original exact penalty, including zero.
        values, vectors = np.linalg.eigh((H + H.T)/2)
        floor = max(1e-12, float(np.max(values))*1e-12)
        A = vectors / np.sqrt(np.maximum(values, floor))
        report['rankSafePreconditioners'] = report.get('rankSafePreconditioners', 0)+1
    return np.ascontiguousarray(X @ A), A, A.T @ (penalty[:, None]*A)

def converged_fit(objective, initial, label):
    x = initial
    iterations = 0
    while True:
        fit = minimize(objective, x, jac=True, method='L-BFGS-B', options={
            'maxiter': meta['maxIterations'], 'ftol': 1e-11, 'gtol': 1e-7,
            'maxls': 50, 'maxcor': 30,
        })
        iterations += fit.nit
        if fit.success:
            return fit.x, {'iterations': iterations, 'converged': True, 'reason': str(fit.message), 'gradientMax': float(np.max(np.abs(fit.jac)))}
        if fit.status != 1:
            raise RuntimeError(f'{label}: optimizer failed: {fit.message}')
        print(f'{label}: continuing after {iterations} iterations; objective={fit.fun:.12g}, gradient={np.max(np.abs(fit.jac)):.6g}', flush=True)
        x = fit.x

def fit_hazard(a, v, r, kind, penalty, warm=None, state=None):
    raw = features(a, r, kind)
    X, mean, scale = design(raw)
    V, _, _ = design(features(v, r, kind), mean, scale)
    e, y = lengths(a, r); ev, yv = lengths(v, r)
    weights = []; n = len(a)
    reg = np.full(X.shape[1], penalty); reg[0] = 0
    for k in range(6):
        mask = e[:, k]+y[:, k] > 0
        xb = np.ascontiguousarray(X[mask]); eb = e[mask, k]; yb = y[mask, k]
        initial = np.zeros(X.shape[1]); initial[0] = np.log(max(1e-10, yb.sum()/max(1, eb.sum()+yb.sum())))
        if warm is not None:
            initial = np.array(warm['weights'][k])
        h0 = np.exp(np.clip(xb @ initial, -30, 8)); ratio0 = np.where(h0 < 50, h0/np.expm1(np.minimum(h0, 50)), 0)
        curvature = eb*h0 + yb*ratio0*(h0+ratio0-1)
        Z, A, P = precondition(xb, curvature, reg, n)
        def objective(u):
            z0 = Z @ u; h = np.exp(np.clip(z0, -30, 8))
            pu = P @ u
            value = (eb @ h-yb @ np.log(-np.expm1(-h)))/n + u @ pu/2
            ratio = np.where(h < 50, h/np.expm1(np.minimum(h, 50)), 0)
            grad = Z.T @ ((eb*h-yb*ratio)*((z0 >= -30) & (z0 <= 8)))/n + pu
            return value, grad
        label = f'R{r} {kind} state={state} lambda={penalty} bin={k}'
        u, status = converged_fit(objective, np.linalg.solve(A, initial), label)
        weights.append(A @ u)
        report['optimizer'].append({'rung': r, 'set': kind, 'state': state, 'lambda': penalty, 'bin': k, **status})
    W = np.asarray(weights); h = np.exp(np.clip(V @ W.T, -30, 8))
    score = np.mean(np.sum(ev*h-yv*np.log(-np.expm1(-h)), axis=1))
    return {'features': names(r, kind), 'mean': mean.tolist(), 'scale': scale.tolist(),
            'weights': W.tolist(), 'lambda': penalty, 'validationNLL': float(score)}

def fit_family(a, v, kind, penalty, warm=None):
    X, mean, scale = design(features(a, 'family', kind)); n, d = X.shape
    V, _, _ = design(features(v, 'family', kind), mean, scale)
    y = a[:, 9].astype(int)-1
    reg = np.full(d, penalty); reg[0] = 0
    Z, A, P = precondition(X, np.ones(n), reg, n)
    def objective(u):
        U = u.reshape(6, d); z = Z @ U.T; z -= z.max(axis=1)[:, None]
        p = np.exp(z); p /= p.sum(axis=1)[:, None]
        PU = U @ P
        value = -np.log(np.maximum(1e-300, p[np.arange(n), y])).mean()+np.sum(U*PU)/2
        p[np.arange(n), y] -= 1
        return value, (p.T @ Z/n+PU).ravel()
    initial = np.zeros((6, d)); initial[:, 0] = np.log(np.maximum(1e-12, np.bincount(y, minlength=6)/n))
    if warm is not None:
        initial = np.array(warm['weights'])
    U, status = converged_fit(objective, np.linalg.solve(A, initial.T).T.ravel(), f'Family {kind} lambda={penalty}')
    W = U.reshape(6, d) @ A.T
    z = V @ W.T; z -= z.max(axis=1)[:, None]; p = np.exp(z); p /= p.sum(axis=1)[:, None]
    score = -np.log(p[np.arange(len(v)), v[:, 9].astype(int)-1]).mean()
    report['optimizer'].append({'rung': 'family', 'set': kind, 'lambda': penalty, **status})
    return {'features': names('family', kind), 'mean': mean.tolist(), 'scale': scale.tolist(), 'weights': W.tolist(), 'lambda': penalty, 'validationNLL': float(score)}

def checkpoint():
    output = f'fit-schema{meta["schema"]}-{stage}.json'
    (root / output).write_text(json.dumps({'models': models, 'bases': bases, 'report': report,
                                         'diagnosticCandidates': diagnostic_candidates}, allow_nan=False))

def select_head(r, kind, fit, state=None):
    key = f'{r}/{kind}' + (f'/{state}' if state is not None else '')
    candidates = []
    warm = None
    cache_path = root / ('candidates-' + key.replace('/', '-') + '.json')
    cache = json.loads(cache_path.read_text()) if '--resume' in sys.argv and cache_path.exists() else {}
    pending = sorted(lambda_grid, reverse=True)
    while pending:
        penalty = pending.pop(0)
        cached = cache.get(str(penalty))
        if cached is not None:
            m = cached['model']; report['optimizer'].extend(cached['optimizer'])
        else:
            before = len(report['optimizer']); m = fit(penalty, warm)
            cache[str(penalty)] = {'model': m, 'optimizer': report['optimizer'][before:]}
            cache_path.write_text(json.dumps(cache, allow_nan=False))
        candidates.append(m); warm = m
        print(f'{key}: converged lambda={penalty:.1e}; validation NLL={m["validationNLL"]:.9f}', flush=True)
        if not pending:
            best = min(candidates, key=lambda m: (m['validationNLL'], m['lambda']))
            smallest = min(m['lambda'] for m in candidates)
            if best['lambda'] == smallest and smallest > 0:
                pending.append(0.0 if smallest <= 1e-14 else float(f'{smallest/10:.1e}'))
                print(f'{key}: extending the grid to {pending[0]:.1e}', flush=True)
    report['candidateScores'][key] = [{'lambda': m['lambda'], 'validationNLL': m['validationNLL']} for m in candidates]
    best = min(candidates, key=lambda m: (m['validationNLL'], m['lambda']))
    if r == 2 and kind == 'legible' and state is None:
        diagnostic_candidates[key] = candidates
    report['heads'][key] = {'lambda': best['lambda'], 'validationNLL': best['validationNLL'], 'features': len(best.get('mean', best.get('alpha', []))), 'state': state}
    out = {k: value for k, value in best.items() if k not in ['lambda', 'validationNLL']}
    print(f'{key}: selected lambda={best["lambda"]:.1e}; all candidates converged', flush=True)
    return out

DEADLINES = {2: 420, 3: 756, 4: 880, 5: 1000}

def rounded(value):
    # Calibrate what actually ships, including seven-significant-digit hazard
    # weights/standardization. Keep the original converged checkpoint intact.
    if isinstance(value, float):
        return float(f'{value:.7g}')
    if isinstance(value, list):
        return [rounded(x) for x in value]
    if isinstance(value, dict):
        return {k: rounded(v) for k, v in value.items()}
    return value

def raw_hazards(a, r, kind, model):
    m = rounded(model)
    raw=features(a,r,kind);d=raw.shape[1]
    X, _, _ = design(raw, np.array(m['mean'][:d]), np.array(m['scale'][:d]))
    return np.exp(np.clip(X @ np.array(m['weights'])[:,:d+1].T, -30, 8))

def integrated(h, delta):
    e = np.column_stack([np.maximum(0, np.minimum(delta, bins[k+1])-bins[k]) for k in range(6)])
    return np.sum(h*e, axis=1)

# 02a: the fresh path never reads a fit checkpoint or candidate cache unless
# explicitly resumed. Reuse is a separate, data-verified reproducibility path.
if '--reuse-heads' in sys.argv:
    previous=Path(sys.argv[sys.argv.index('--reuse-heads')+1]);old_meta=json.loads((previous/'meta.json').read_text())
    old_path=previous/f'fit-schema{old_meta["schema"]}-all.json';old=json.loads(old_path.read_text())
    if old_meta['splits']!=meta['splits'] or any(old_meta['features'][str(r)]['full']!=meta['features'][str(r)]['full'] for r in [2,3,4,5,'family']):
        raise ValueError('Reuse requires the identical raw feature and world contract')
    for split in ['train','validation']:
        if (previous/f'{split}.bin').read_bytes()!=(root/f'{split}.bin').read_bytes():raise ValueError(f'{split} bytes changed')
    bases=old['bases'];models=old['models']
    for r in [2,3,4,5]:
        models[str(r)].pop('legible',None)
        for kind in ['prior','full']:
            head=models[str(r)][kind];head.pop('calibration',None)
            for m in ([head] if kind=='prior' else head['states']):m.pop('calibration',None)
    for k in ['optimizer','heads','candidateScores','rankSafePreconditioners']:
        if k in old['report']:report[k]=old['report'][k]
    report['heads']={k:v for k,v in report['heads'].items() if '/legible/' not in k or k.startswith('family/')}
    report['candidateScores']={k:v for k,v in report['candidateScores'].items() if '/legible/' not in k or k.startswith('family/')}
    report['provenanceMode']='verified raw-head reuse'
    report['reusedHeads']={'sourceSchema':old_meta['schema'],'checkpointSHA256':hashlib.sha256(old_path.read_bytes()).hexdigest()}
else:
    report['provenanceMode']='from scratch: fixed initialization, no fit checkpoints'
    for r in [2,3,4,5]:
        a,v=data['train'],data['validation'];a=a[((a[:,meta['sampleMaskColumn']].astype(int)&3)!=0)&(a[:,r+3]>a[:,2])];v=v[((v[:,meta['sampleMaskColumn']].astype(int)&3)!=0)&(v[:,r+3]>v[:,2])]
        bases[str(r)]=make_basis(a,r)
        models[str(r)]['prior']=select_head(r,'prior',lambda lam,warm:fit_hazard(a,v,r,'prior',lam,warm))
        head={'features':names(r,'full'),'states':[]}
        for state in [0,1]:
            at=a[raw_features(a,r,'legible')[:,4]==state];vt=v[raw_features(v,r,'legible')[:,4]==state]
            fitted=select_head(r,'full',lambda lam,warm:fit_hazard(at,vt,r,'full',lam,warm,state),state);fitted.pop('features');head['states'].append(fitted)
        models[str(r)]['full']=head;checkpoint()
    family_data={split:a[(a[:,meta['sampleMaskColumn']].astype(int)&9)!=0] for split,a in data.items()}
    bases['family']=make_basis(family_data['train'],'family')
    for kind in ['legible','full']:
        head={'features':names('family',kind),'acts':[]}
        for act in [0,1,2]:
            a=family_data['train'][family_data['train'][:,3]==act];v=family_data['validation'][family_data['validation'][:,3]==act]
            fitted=select_head('family',kind,lambda lam,warm:fit_family(a,v,kind,lam,warm),f'act{act}');fitted.pop('features');head['acts'].append(fitted)
        models['family'][kind]=head;checkpoint()

# 02a: prior raw hazards and calibration see clock/rung only. No claim flag.
for r in [2,3,4,5]:
    prior=models[str(r)]['prior'];d=len(names(r,'prior'))
    if len(prior['mean'])!=d or any(len(w)!=d+1 for w in prior['weights']):raise ValueError('Prior feature dimensions changed')
    prior['features']=names(r,'prior')
    models[str(r)]['legible']={'features':meta['features'][str(r)]['legible']}

FLOOR=meta['hazardFloor'];TOL=5e-11;MIN_N=meta['minCalibrationWorlds'];MIN_EVENTS=meta['minCalibrationEvents'];LOW=-40.;HIGH=40.
report['calibrationFits']=[]
report['calibrationStage']={'tolerance':TOL,'knots':meta['calibrationDays'],'minWorlds':MIN_N,'minSegmentEventsAndSurvivors':MIN_EVENTS,
    'segmentIdentity':'Stable geometric segments: early through min(quarter, live deadline), middle through max(quarter, deadline), tail through support. After deadline, middle through quarter then tail. Zero-width segments vanish; absent scales borrow for interpolation.',
    'fallbackRule':'Nearest solved same-state/same-head/same-segment knot, ties earlier. If none exists, use a pooled-state same-head fit. No valid pooled source: identity, explicitly reported.',
    'boundaryRule':'A segment requires five observed events inside it and five survivors at its end; zero/rare increments borrow a valid knot scale. Raw unreachable/borrowed-prefix overshoot uses reported fallback.',
    'priorInformation':'Clock/rung only, with one calibration stage pooled over claim states.',
    'fallbacks':[],'boundarySolutions':[],'cells':{},'targetCovariance':{},'roleLimits':[]}

def horizons(r,day):
    support=1260 if r==5 else 1008;quarter=min(day+63,support);deadline=DEADLINES[r];out=[]
    if deadline>day:
        early=min(quarter,deadline);middle=max(quarter,deadline)
        if early>day:out.append(('early',early))
        if middle>early:out.append(('middle',middle))
        if support>middle:out.append(('tail',support))
    else:
        if quarter>day:out.append(('middle',quarter))
        if support>quarter:out.append(('tail',support))
    return out

def scalar(log_increment,offset,target,label):
    increment=np.exp(log_increment)
    def evaluate(value):
        tail=np.exp(value)*increment;H=offset+tail
        return float((-np.expm1(-H)).mean()-target),float((tail*np.exp(-H)).mean())
    lo,hi=LOW,HIGH;fl,_=evaluate(lo);fh,_=evaluate(hi)
    if fl>TOL or fh<-TOL:return None,{'reason':'borrowedPrefixExceedsTarget' if fl>TOL else 'rawIncrementCannotReachTarget','lowResidual':fl,'highResidual':fh}
    value=0.
    for iteration in range(300):
        f,g=evaluate(value)
        if abs(f)<=TOL:
            result={'head':label,'sigma':float(value),'iterations':iteration,'converged':True,'maxMomentError':abs(f),'boundarySolution':False,'uniqueFinite':True}
            report['calibrationFits'].append(result);return float(value),result
        if f>0:hi=value
        else:lo=value
        candidate=value-f/g if g>0 else np.nan;value=candidate if lo<candidate<hi else (lo+hi)/2
    raise RuntimeError(f'{label}: scalar calibration did not converge')

for r in [2,3,4,5]:
    support=1260 if r==5 else 1008;DAYS=meta['calibrationDays'][str(r)]
    a=data['train'];a=a[np.isin(a[:,2],DAYS)&(a[:,r+3]>a[:,2])]
    claims=raw_features(a,r,'legible')[:,4].astype(int)
    # 02a combined training/test noise: preserve covariance when fallback or
    # interpolated targets reuse worlds. One observation per training world at
    # each day makes these world-clustered target-mean influence vectors exact.
    worlds=np.unique(a[:,0]);world_index=np.searchsorted(worlds,a[:,0]);cov_keys=[];influences=[]
    for group in [0,1,'pooled']:
        for day in DAYS:
            mask=(a[:,2]==day)&((claims==group) if group!='pooled' else True);n=int(mask.sum())
            for name,end in horizons(r,day):
                values=np.zeros(len(worlds));y=(a[mask,r+3]<=end).astype(float)
                if n>1:values[world_index[mask]]=(y-y.mean())/n*np.sqrt(n/(n-1))
                cov_keys.append(f'{group}/{day}/{name}');influences.append(values)
    influence_matrix=np.asarray(influences)
    report['calibrationStage']['targetCovariance'][str(r)]={'keys':cov_keys,'matrix':(influence_matrix@influence_matrix.T).tolist()}
    del influence_matrix,influences
    for kind in ['prior','legible','full']:
        head=models[str(r)][kind]
        if kind=='legible':
            m=a[:,L['rules']+(r-2)*4];w=a[:,L['rules']+1+(r-2)*4]
            raw=lambda end:np.maximum(FLOOR,np.logaddexp(0,(end-m)/w)-np.logaddexp(0,(a[:,2]-m)/w))
        else:
            if kind=='prior':hazards=raw_hazards(a,r,kind,head)
            else:
                hazards=np.empty((len(a),6))
                for state in [0,1]:
                    mask=claims==state;hazards[mask]=raw_hazards(a[mask],r,kind,head['states'][state])
            raw=lambda end:integrated(hazards,end-a[:,2])
        raw_ends={'quarter':raw(np.minimum(a[:,2]+63,support)),'deadline':raw(np.full(len(a),DEADLINES[r])),'support':raw(np.full(len(a),support))}
        nodes={};groups=['pooled'] if kind=='prior' else [0,1,'pooled']
        for group in groups:
            for day in DAYS:
                mask=(a[:,2]==day)&((claims==group) if group!='pooled' else True);n=int(mask.sum());order=horizons(r,day);previous=np.zeros(n);prefix=[];previous_events=0
                for name,end in order:
                    horizon='support' if end==support else 'quarter' if end==min(day+63,support) else 'deadline'
                    H=raw_ends[horizon][mask];increment=np.maximum(0,H-previous);events=int((a[mask,r+3]<=end).sum());segment_events=events-previous_events;survivors=n-events;eligible=n>=MIN_N and segment_events>=MIN_EVENTS and survivors>=MIN_EVENTS and np.any(increment>0)
                    nodes[group,day,name]={'group':group,'day':day,'name':name,'end':end,'n':n,'events':events,'segmentEvents':segment_events,'survivors':survivors,'eligible':bool(eligible),'increment':increment,'prefix':prefix.copy(),'target':events/n if n else 0.,'resolved':False}
                    previous=H;previous_events=events;prefix.append(name)
        resolving=set()
        def resolve(key):
            node=nodes[key]
            if node['resolved']:return node['sigma']
            if key in resolving:raise RuntimeError('Internal calibration borrowing cycle')
            resolving.add(key);group,day,name=key
            offset=np.zeros(node['n'])
            for previous_name in node['prefix']:
                pkey=(group,day,previous_name);offset+=np.exp(resolve(pkey))*nodes[pkey]['increment']
            label=f'{r}/{kind}/{group}/day{day}/{name}';result=None
            reason='tooFewWorlds' if node['n']<MIN_N else 'tooFewSegmentEventsOrSurvivors' if min(node['segmentEvents'],node['survivors'])<MIN_EVENTS else 'zeroRawIncrement'
            if node['eligible']:
                with np.errstate(divide='ignore'):sigma,result=scalar(np.log(node['increment']),offset,node['target'],label)
                if sigma is None:reason=result['reason'];result=None
            if result is not None:
                node['sigma']=sigma;node['solved']=True
            else:
                source=None
                for source_group in ([group,'pooled'] if group!='pooled' else ['pooled']):
                    candidates=[k for k,v in nodes.items() if k[0]==source_group and k[2]==name and v['eligible'] and k not in resolving]
                    for candidate in sorted(candidates,key=lambda k:(abs(k[1]-day),k[1])):
                        resolve(candidate)
                        if nodes[candidate].get('solved'):source=candidate;break
                    if source is not None:break
                node['sigma']=nodes[source]['sigma'] if source is not None else 0.;node['solved']=False
                fallback={'rung':r,'set':kind,'state':group,'day':day,'segment':name,'reason':reason,'n':node['n'],'events':node['events'],'segmentEvents':node['segmentEvents'],'survivors':node['survivors'],'source':list(source) if source is not None else 'identityNoValidSource','sigma':node['sigma']}
                node['fallback']=fallback
                if group!='pooled' or kind=='prior':report['calibrationStage']['fallbacks'].append(fallback)
            node['resolved']=True;resolving.remove(key);return node['sigma']
        # Resolve used nodes before filling absent semantic segments.
        for group in groups:
            for day in DAYS:
                for name,end in horizons(r,day):resolve((group,day,name))
        calibration_stage={'knots':DAYS,'states':[]}
        for group in (['pooled'] if kind=='prior' else [0,1]):
            sigma={name:[] for name in ['early','middle','tail']};cells=[]
            for day in DAYS:
                for name in sigma:
                    key=(group,day,name)
                    if key in nodes:
                        node=nodes[key];value=node['sigma'];cells.append({k:v for k,v in node.items() if k not in ['increment','prefix','resolved']})
                    else:
                        candidates=[k for k,v in nodes.items() if k[0]==group and k[2]==name and v.get('solved')]
                        if not candidates:candidates=[k for k,v in nodes.items() if k[0]=='pooled' and k[2]==name and v.get('solved')]
                        source=min(candidates,key=lambda k:(abs(k[1]-day),k[1])) if candidates else None
                        value=nodes[source]['sigma'] if source is not None else 0.
                        report['calibrationStage']['fallbacks'].append({'rung':r,'set':kind,'state':group,'day':day,'segment':name,'reason':'inactiveOrCoincidentBoundary','source':list(source) if source is not None else 'identityNoValidSource','sigma':value})
                    sigma[name].append(value)
            # 02a: a vanishing segment has independently held endpoint values
            # on either side. In particular middle vanishes at D_R-63; borrowing
            # its post-crossing scale as the left limit blended distinct roles.
            limits=[]
            for day in DAYS:
                active={name for name,_ in horizons(r,day)}
                before={name for name,_ in horizons(r,day-1)} if day>0 else set()
                after={name for name,_ in horizons(r,day+1)}
                for name in ['early','middle','tail']:
                    if name in active or name not in before|after:continue
                    entry={'day':day,'segment':name}
                    for side,available in [('left',before),('right',after)]:
                        if name not in available:
                            entry[side]=None
                            continue
                        source=None
                        for source_group in ([group,'pooled'] if group!='pooled' else ['pooled']):
                            candidates=[k for k,v in nodes.items() if k[0]==source_group and k[2]==name and v.get('solved')
                                and (k[1]<day if side=='left' else k[1]>day)]
                            if candidates:
                                source=min(candidates,key=lambda k:(abs(k[1]-day),k[1]))
                                break
                        entry[side]={'sigma':nodes[source]['sigma'] if source is not None else 0.,
                            'source':list(source) if source is not None else 'identityNoValidSideSource'}
                    limits.append(entry)
                    report['calibrationStage']['roleLimits'].append({'rung':r,'set':kind,'state':group,**entry})
            calibration_stage['states'].append({'sigma':sigma,'limits':limits});report['calibrationStage']['cells'][f'{r}/{kind}/{group}']=cells
        head['calibration']=calibration_stage
        print(f'R{r} {kind}: calibrated grid and role knots; fallbacks so far {len(report["calibrationStage"]["fallbacks"])}',flush=True)
    checkpoint()
checkpoint()
