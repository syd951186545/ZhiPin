import React from 'react';
import {Link} from 'react-router-dom';
import {motion} from 'motion/react';
import {ArrowLeft, FileQuestion} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {useI18n} from '@/contexts/I18nContext';

export default function NotFound() {
  const { t } = useI18n();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="text-center"
      >
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
          <FileQuestion className="w-10 h-10 text-muted-foreground" />
        </div>
        <h1 className="text-6xl font-bold text-foreground mb-2">404</h1>
        <h2 className="text-xl font-semibold text-foreground mb-2">{t('notFound.title')}</h2>
        <p className="text-muted-foreground mb-8 max-w-sm">{t('notFound.desc')}</p>
        <Button asChild>
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t('notFound.back')}
          </Link>
        </Button>
      </motion.div>
    </div>
  );
}
