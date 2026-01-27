import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, Volume2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { portal } from '../services/api';
import type { ReadingAssessmentDetail } from '../types/readingAssessment';
import PortalLayout from '../components/PortalLayout';
import LoadingState from '../components/LoadingState';
import AudioPlayer from '../components/AudioPlayer';
import { Button } from '@/components/ui/button';

const PortalReadingAssessmentDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [assessment, setAssessment] = useState<ReadingAssessmentDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchAssessment(id);
    }
  }, [id]);

  const fetchAssessment = async (assessmentId: string) => {
    setLoading(true);
    try {
      const data = await portal.getReadingAssessment(assessmentId);
      setAssessment(data.assessment);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.response?.data?.error || "Failed to load assessment",
        variant: "destructive"
      });
      navigate('/portal/reading-assessments');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
    });
  };

  const getLanguageName = (code: string) => {
    const names: Record<string, string> = { en: 'English', ur: 'Urdu', ar: 'Arabic', es: 'Spanish' };
    return names[code] || code;
  };

  const getPassageTypeDisplay = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const getBenchmarkColor = (status: string) => {
    if (status.includes('Above')) return 'text-green-600 bg-green-50';
    if (status.includes('Below')) return 'text-red-600 bg-red-50';
    return 'text-yellow-600 bg-yellow-50';
  };

  const handleDownloadPdf = () => {
    if (assessment?.outputs.reportPdfUrl) {
      window.open(assessment.outputs.reportPdfUrl, '_blank');
    }
  };

  if (loading) return <PortalLayout><LoadingState /></PortalLayout>;
  if (!assessment) return null;

  return (
    <PortalLayout>
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Button
          variant="ghost"
          onClick={() => navigate('/portal/reading-assessments')}
          className="mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Assessments
        </Button>

        <div className="bg-white rounded-lg p-6 border border-border mb-6">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground mb-2">{assessment.studentName}</h1>
              <div className="flex flex-wrap items-center gap-2 text-sm mb-2">
                <span className="bg-secondary px-2 py-1 rounded">Grade {assessment.gradeLevel}</span>
                <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">{getLanguageName(assessment.language)}</span>
                <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded">{getPassageTypeDisplay(assessment.passageType)}</span>
              </div>
              <p className="text-sm text-muted-foreground">{formatDate(assessment.assessmentDate)}</p>
            </div>
            {assessment.outputs.reportPdfUrl && (
              <Button onClick={handleDownloadPdf} className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                Download PDF Report
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground mb-1">Words Per Minute</p>
            <p className="text-3xl font-bold text-foreground">{assessment.fluency.wcpm}</p>
            {assessment.fluency.percentileRank && (
              <p className="text-xs text-muted-foreground mt-1">{assessment.fluency.percentileRank} percentile</p>
            )}
          </div>
          <div className="bg-white rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground mb-1">Accuracy</p>
            <p className="text-3xl font-bold text-foreground">{assessment.fluency.accuracy}%</p>
            <p className="text-xs text-muted-foreground mt-1">{assessment.fluency.wordsCorrect}/{assessment.fluency.wordsRead} words</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-border">
            <p className="text-sm text-muted-foreground mb-1">Benchmark Status</p>
            <p className={`text-sm font-semibold px-2 py-1 rounded inline-block ${getBenchmarkColor(assessment.fluency.benchmarkStatus)}`}>
              {assessment.fluency.benchmarkStatus}
            </p>
          </div>
        </div>

        {assessment.comprehension && (
          <div className="bg-white rounded-lg p-6 border border-border mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Comprehension Questions</h2>
            <div className="mb-4">
              <p className="text-lg font-bold text-foreground">
                Score: {assessment.comprehension.score}% ({assessment.comprehension.questionsCorrect}/{assessment.comprehension.questionsAsked})
              </p>
            </div>
            <div className="space-y-4">
              {assessment.comprehension.questions.map((q) => (
                <div key={q.id} className="border border-border rounded-lg p-4">
                  <div className="flex gap-3">
                    {q.isCorrect ? (
                      <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                    ) : (
                      <XCircle size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1">
                      <p className="font-semibold text-foreground mb-2">{q.id}. {q.question}</p>
                      <div className="space-y-1 text-sm">
                        <p className="text-foreground"><span className="font-medium">Student:</span> "{q.studentAnswer}"</p>
                        <p className="text-muted-foreground"><span className="font-medium">Expected:</span> {q.expectedAnswer}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg p-6 border border-border mb-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Reading Passage</h2>
          {assessment.passage.imageUrl && (
            <div className="mb-4">
              <img src={assessment.passage.imageUrl} alt="Reading passage" className="w-full max-w-2xl border border-border rounded-lg" />
            </div>
          )}
          <div className="bg-secondary rounded-lg p-4 mb-4">
            <p className="text-foreground whitespace-pre-wrap leading-relaxed">{assessment.passage.text}</p>
          </div>
          <p className="text-sm text-muted-foreground">{assessment.passage.wordCount} words</p>
        </div>

        {assessment.audio.url && (
          <div className="bg-white rounded-lg p-6 border border-border mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Student Recording</h2>
            <AudioPlayer
              audioUrl={assessment.audio.url}
              duration={assessment.audio.duration}
              title={`Student Recording (${Math.round(assessment.audio.duration || 0)}s)`}
              enhanced={true}
              showDownload={true}
            />
            {assessment.audio.transcript && (
              <div className="mt-4">
                <h3 className="font-semibold text-foreground mb-2">Transcript</h3>
                <div className="bg-secondary rounded-lg p-4">
                  <p className="text-foreground whitespace-pre-wrap">{assessment.audio.transcript}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {assessment.outputs.voiceFeedbackUrl && (
          <div className="bg-white rounded-lg p-6 border border-border mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              Voice Feedback
            </h2>
            <AudioPlayer
              audioUrl={assessment.outputs.voiceFeedbackUrl}
              duration={assessment.outputs.voiceFeedbackDuration}
              title="Teacher Feedback"
              enhanced={true}
              showDownload={true}
            />
          </div>
        )}

        {assessment.fluency.errors.length > 0 && (
          <div className="bg-white rounded-lg p-6 border border-border mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Reading Errors</h2>
            <div className="space-y-2">
              {assessment.fluency.errors.map((error, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-red-50 rounded-lg">
                  <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
                  <div className="flex-1 text-sm">
                    <span className="font-medium text-foreground">{error.type}:</span> {error.word}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {assessment.pronunciation.mispronunciations.length > 0 && (
          <div className="bg-white rounded-lg p-6 border border-border mb-6">
            <h2 className="text-xl font-semibold text-foreground mb-4">Pronunciation Guidance</h2>
            <div className="space-y-3">
              {assessment.pronunciation.mispronunciations.map((mp, idx) => (
                <div key={idx} className="border border-border rounded-lg p-4">
                  <p className="font-semibold text-foreground mb-1">Word: {mp.word}</p>
                  <p className="text-sm text-muted-foreground mb-2">{mp.actualIssue}</p>
                  <p className="text-sm text-foreground">{mp.guidance}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {assessment.diagnosticSummary && (
          <div className="bg-white rounded-lg p-6 border border-border">
            <h2 className="text-xl font-semibold text-foreground mb-4">Diagnostic Summary & Recommendations</h2>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-foreground whitespace-pre-wrap leading-relaxed">{assessment.diagnosticSummary}</p>
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
};

export default PortalReadingAssessmentDetail;
