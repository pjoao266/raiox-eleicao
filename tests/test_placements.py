import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from placements import city_positions,placement_counts

class PlacementTests(unittest.TestCase):
 def test_ties_share_position_and_do_not_rank_zero_votes(self):
  self.assertEqual(city_positions([['a',50,50],['b',50,50],['c',30,30],['d',0,0],['bad',90,90]],{'a','b','c','d'}),{'a':1,'b':1,'c':3})
 def test_counts_keep_regions_separate_and_groups_exclusive(self):
  cities={'mg1':{'rows':[['a',80,80],['b',20,20]]},'mg2':{'rows':[['a',20,20],['b',80,80]]},'sp1':{'rows':[['a',40,40],['b',60,60]]}}
  result=placement_counts(cities,{'a','b'})
  self.assertEqual(result['a']['br']['counts'][:3],[1,2,0])
  self.assertEqual(result['a']['mg']['counts'][:3],[1,1,0])
  self.assertEqual(result['a']['sp']['counts'][:3],[0,1,0])
  self.assertEqual(sum(result['a']['br']['counts']),3)
 def test_absent_candidates_are_not_zero_results(self):
  result=placement_counts({'mg1':{'rows':[['a',1,100]]}},{'a','b'})
  self.assertEqual(result['b']['br']['loaded'],0)
  self.assertEqual(result['b']['br']['counts'],[0]*10)

if __name__=='__main__':unittest.main()
