import pandas as pd, numpy as np, json
import sys, os
HERE=os.path.dirname(os.path.abspath(__file__))
src=sys.argv[1] if len(sys.argv)>1 else os.path.join(HERE,'..','6_数据表_四大径_点位环境指标_v1.xlsx')
df=pd.read_excel(src,'点位指标')
order=['M','W','H','L']
df['t']=df.trail_code.map({c:i for i,c in enumerate(order)})
df=df.sort_values(['t','fid']).reset_index(drop=True)
# gap flag: 1 if location jump before this point
gap=np.zeros(len(df),int)
for t,g in df.groupby('t'):
    idx=g.index.values
    la,lo=np.radians(g.lat.values),np.radians(g.lon.values)
    d=6371*np.sqrt(np.diff(la)**2+(np.cos(la[1:])*np.diff(lo))**2)
    dd=np.diff(g.dist_km.values)
    j=(d>0.15)|(dd>0.1)
    gap[idx[1:][j]]=1
df['gap']=gap
df['q']=(df.quality_flag=='低').astype(int)
df['ym']=df.pano_date.str[:4].astype(int)*100+df.pano_date.str[5:7].astype(int)
cols={'fid':0,'t':0,'gap':0,'q':0,'ym':0,'dist_km':3,'lat':6,'lon':6,'offset_m':1,'dem_m':1,
 'qc_lap_bottom':0,'qc_lum':0,
 'tree_N':1,'tree_E':1,'tree_S':1,'tree_W':1,'tree_frac':3,'gvi':3,'sky_frac':3,
 'h_tree_max':1,'h_built_max':1,'h_terrain_max':1,'h_obs_max':1,
 'e_08':3,'e_10':3,'e_12':3,'e_14':3,'static_share':3,'e_arr_08':3,'e_arr_10':3,'e_arr_12':3,'e_arr_14':3}
out={}
for c,r in cols.items():
    v=df[c].round(r)
    out[c]=[None if pd.isna(x) else (int(x) if r==0 else float(x)) for x in v]
trails=[{'code':'M','en':'MacLehose Trail','cn':'麦理浩径','color':'#0072B2'},
        {'code':'W','en':'Wilson Trail','cn':'卫奕信径','color':'#E69F00'},
        {'code':'H','en':'Hong Kong Trail','cn':'港岛径','color':'#CC79A7'},
        {'code':'L','en':'Lantau Trail','cn':'凤凰径','color':'#009E73'}]
s=json.dumps({'n':len(df),'trails':trails,'cols':out,'source':os.path.basename(src)},ensure_ascii=False,separators=(',',':'))
open(os.path.join(HERE,'..','data','points.js'),'w',encoding='utf-8').write('window.TRAIL_DATA='+s+';\n')
print(len(s)/1e6,'MB', df.gap.sum())
