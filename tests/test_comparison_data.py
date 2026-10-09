import importlib.util, pathlib, unittest
spec = importlib.util.spec_from_file_location('comparison_data', pathlib.Path(__file__).parents[1]/'scripts/comparison_data.py')
m = importlib.util.module_from_spec(spec)
if spec.loader: spec.loader.exec_module(m)
class ComparisonDataTests(unittest.TestCase):
 def test_2026_denominators_and_null_technical(self):
  result=m.normalize_2026({'e':{'te':'200','c':'150','a':'50'},'v':{'tv':'150','vvc':'120','vb':'10','tvn':'19','vn':'18','vnt':'1'},'carg':[]})
  self.assertEqual(result['null'],19)
  self.assertEqual(result['otherInvalid'],1)
  self.assertEqual(result['eligible'],200)
 def test_2022_aggregation_sums_zones_without_averaging(self):
  a=m.normalize_2022({'QT_APTOS':'200','QT_COMPARECIMENTO':'100','QT_ABSTENCOES':'100','QT_VOTOS':'100','QT_TOTAL_VOTOS_VALIDOS':'90','QT_VOTOS_BRANCOS':'3','QT_TOTAL_VOTOS_NULOS':'7'})
  b=m.normalize_2022({'QT_APTOS':'20','QT_COMPARECIMENTO':'20','QT_ABSTENCOES':'0','QT_VOTOS':'20','QT_TOTAL_VOTOS_VALIDOS':'10','QT_VOTOS_BRANCOS':'4','QT_TOTAL_VOTOS_NULOS':'6'})
  c=m.add_totals([a,b]);self.assertEqual(c['valid'],100);self.assertEqual(c['cast'],120);self.assertEqual(c['eligible'],220)
if __name__=='__main__': unittest.main()
