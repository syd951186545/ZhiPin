import React, {useState} from 'react';
import {LayoutGrid, List, Mail, Phone, Plus, Search} from 'lucide-react';
import {motion} from 'motion/react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Card, CardContent} from '@/components/ui/card';
import {Badge} from '@/components/ui/badge';
import {Skeleton} from '@/components/ui/skeleton';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,} from '@/components/ui/dialog';
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue,} from '@/components/ui/select';
import PageHeader from '@/components/shared/PageHeader';
import StatusBadge from '@/components/shared/StatusBadge';
import EmptyState from '@/components/shared/EmptyState';
import {useI18n} from '@/contexts/I18nContext';
import {useCandidates} from '@/hooks/useCandidates';
import {CANDIDATE_SOURCE, CANDIDATE_STAGE} from '@/lib/constants';
import type {Candidate} from '@/types/database';

function getScoreColor(score: number | null): string {
  if (!score) return 'bg-gray-200';
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-blue-500';
  if (score >= 50) return 'bg-yellow-500';
  return 'bg-red-500';
}

function getScoreTextColor(score: number | null): string {
  if (!score) return 'text-gray-500';
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-blue-600';
  if (score >= 50) return 'text-yellow-600';
  return 'text-red-600';
}

export default function Candidates() {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('all');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);

  const { candidates, loading, error } = useCandidates({
    search: search || undefined,
    stage: stageFilter === 'all' ? undefined : stageFilter,
  });

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('candidates.title')} description={t('candidates.desc')} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="pt-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('candidates.title')} description={t('candidates.desc')}>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          {t('candidates.add')}
        </Button>
      </PageHeader>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('candidates.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('candidates.stage.all')}</SelectItem>
            {Object.entries(CANDIDATE_STAGE).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex border rounded-md">
          <Button
            variant={viewMode === 'card' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('card')}
            className="rounded-r-none"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('table')}
            className="rounded-l-none"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</div>
      )}

      {candidates.length === 0 ? (
        <EmptyState title={t('candidates.title')} description={t('candidates.desc')} />
      ) : viewMode === 'card' ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {candidates.map((candidate) => (
            <Card
              key={candidate.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => setSelectedCandidate(candidate)}
            >
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-base">{candidate.name}</h3>
                    <p className="text-sm text-muted-foreground">{(candidate.metadata as Record<string, string>)?.job_title || '-'}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-2xl font-bold ${getScoreTextColor(candidate.ai_match_score)}`}>
                      {candidate.ai_match_score ?? '-'}
                    </span>
                    <p className="text-xs text-muted-foreground">{t('candidates.table.match')}</p>
                  </div>
                </div>
                <div className="mb-3">
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${getScoreColor(candidate.ai_match_score)}`}
                      style={{ width: (candidate.ai_match_score || 0) + '%' }}
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <StatusBadge status={candidate.stage} type="candidate" />
                  <Badge variant="outline">{CANDIDATE_SOURCE[candidate.source] || candidate.source}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{formatDate(candidate.created_at)}</p>
              </CardContent>
            </Card>
          ))}
        </motion.div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-3 font-medium">{t('candidates.table.name')}</th>
                    <th className="text-left p-3 font-medium">{t('candidates.table.role')}</th>
                    <th className="text-center p-3 font-medium">{t('candidates.table.match')}</th>
                    <th className="text-center p-3 font-medium">{t('candidates.table.stage')}</th>
                    <th className="text-center p-3 font-medium hidden md:table-cell">{t('candidates.table.source')}</th>
                    <th className="text-left p-3 font-medium hidden lg:table-cell">{t('candidates.table.applied')}</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedCandidate(c)}
                    >
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className="p-3 text-muted-foreground">{(c.metadata as Record<string, string>)?.job_title || '-'}</td>
                      <td className="p-3 text-center">
                        <span className={`font-semibold ${getScoreTextColor(c.ai_match_score)}`}>
                          {c.ai_match_score ?? '-'}
                        </span>
                      </td>
                      <td className="p-3 text-center"><StatusBadge status={c.stage} type="candidate" /></td>
                      <td className="p-3 text-center hidden md:table-cell">
                        <Badge variant="outline">{CANDIDATE_SOURCE[c.source] || c.source}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground hidden lg:table-cell">{formatDate(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={!!selectedCandidate} onOpenChange={() => setSelectedCandidate(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedCandidate && (
            <>
              <DialogHeader>
                <DialogTitle>{t('candidates.detail.title')}</DialogTitle>
                <DialogDescription>{selectedCandidate.name}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xl font-bold">{selectedCandidate.name}</h3>
                    <p className="text-muted-foreground">{(selectedCandidate.metadata as Record<string, string>)?.job_title || '-'}</p>
                  </div>
                  <div className="text-center">
                    <span className={`text-3xl font-bold ${getScoreTextColor(selectedCandidate.ai_match_score)}`}>
                      {selectedCandidate.ai_match_score ?? '-'}
                    </span>
                    <p className="text-xs text-muted-foreground">{t('candidates.table.match')}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <StatusBadge status={selectedCandidate.stage} type="candidate" />
                  <Badge variant="outline">{CANDIDATE_SOURCE[selectedCandidate.source] || selectedCandidate.source}</Badge>
                </div>

                <div className="space-y-2 text-sm">
                  <h4 className="font-semibold">{t('candidates.detail.contact')}</h4>
                  {selectedCandidate.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-4 w-4" />
                      <span>{selectedCandidate.email}</span>
                    </div>
                  )}
                  {selectedCandidate.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="h-4 w-4" />
                      <span>{selectedCandidate.phone}</span>
                    </div>
                  )}
                </div>

                {selectedCandidate.ai_analysis && (
                  <div className="space-y-3 text-sm">
                    <h4 className="font-semibold">{t('candidates.detail.aiAnalysis')}</h4>
                    {selectedCandidate.ai_analysis.strengths?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-green-600 mb-1">{t('candidates.detail.strengths')}</p>
                        <ul className="space-y-1">
                          {selectedCandidate.ai_analysis.strengths.map((s, i) => (
                            <li key={i} className="text-muted-foreground">+ {s}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedCandidate.ai_analysis.weaknesses?.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-orange-600 mb-1">{t('candidates.detail.weaknesses')}</p>
                        <ul className="space-y-1">
                          {selectedCandidate.ai_analysis.weaknesses.map((w, i) => (
                            <li key={i} className="text-muted-foreground">- {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedCandidate.ai_analysis.summary && (
                      <p className="text-muted-foreground italic">{selectedCandidate.ai_analysis.summary}</p>
                    )}
                    {selectedCandidate.ai_analysis.recommendation && (
                      <div className="rounded-md bg-primary/10 p-3">
                        <p className="text-xs font-medium mb-1">{t('candidates.detail.recommendation')}</p>
                        <p className="text-sm">{selectedCandidate.ai_analysis.recommendation}</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedCandidate.notes && (
                  <div className="text-sm">
                    <h4 className="font-semibold mb-1">{t('candidates.detail.notes')}</h4>
                    <p className="text-muted-foreground">{selectedCandidate.notes}</p>
                  </div>
                )}

                {selectedCandidate.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selectedCandidate.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary">{tag}</Badge>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
