import React, { useState } from 'react';
import type { UserLink } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
// Lazy: evita arrastrar las plantillas públicas al chunk del dashboard
const ProfileBarberTemplate = React.lazy(() => import('./ProfileBarberTemplate').then(m => ({ default: m.ProfileBarberTemplate })));
const ProfileGastroTemplate = React.lazy(() => import('./ProfileGastroTemplate').then(m => ({ default: m.ProfileGastroTemplate })));
const ProfilePetcareTemplate = React.lazy(() => import('./ProfilePetcareTemplate').then(m => ({ default: m.ProfilePetcareTemplate })));
const ProfileMedicalTemplate = React.lazy(() => import('./ProfileMedicalTemplate').then(m => ({ default: m.ProfileMedicalTemplate })));
const ProfileEcomTemplate = React.lazy(() => import('./ProfileEcomTemplate').then(m => ({ default: m.ProfileEcomTemplate })));
const ProfileRealtyTemplate = React.lazy(() => import('./ProfileRealtyTemplate').then(m => ({ default: m.ProfileRealtyTemplate })));
const ProfileSublimaTemplate = React.lazy(() => import('./ProfileSublimaTemplate').then(m => ({ default: m.ProfileSublimaTemplate })));
// Faltaba: los perfiles de artista caían al bloque genérico del final y el
// dueño veía una maqueta que no era la suya al ajustar su apariencia.
const ProfileStageTemplate = React.lazy(() => import('./ProfileStageTemplate').then(m => ({ default: m.ProfileStageTemplate })));

const PreviewSpinner = () => (
  <div className="min-h-full bg-gray-800 flex items-center justify-center h-[650px]">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
  </div>
);

interface MobilePreviewProps {
  profileData: any;
  links?: UserLink[];
}

const getEmbedUrl = (url: string) => {
  if (!url) return '';
  try {
    const videoUrl = new URL(url);
    let videoId = '';
    if (videoUrl.hostname.includes('youtube.com') || videoUrl.hostname.includes('youtu.be')) {
      videoId = videoUrl.searchParams.get('v') || videoUrl.pathname.split('/').pop();
      return `https://www.youtube.com/embed/${videoId}`;
    } else if (videoUrl.hostname.includes('vimeo.com')) {
      videoId = videoUrl.pathname.split('/').pop();
      return `https://player.vimeo.com/video/${videoId}`;
    }
  } catch (e) { /* ignore */ }
  return url;
};

export const MobilePreview: React.FC<MobilePreviewProps> = ({ profileData, links = [] }) => {
  const { t } = useLanguage();
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null);

  // GUARDIA MEJORADA: Espera a que al menos el nombre exista
  if (!profileData || typeof profileData.displayName === 'undefined') {
    return (
      <div className="w-full max-w-[350px] mx-auto lg:sticky lg:top-24">
        <div className="relative border-[10px] border-black rounded-[40px] shadow-2xl bg-black">
          <div className="overflow-y-auto h-[650px] rounded-[30px] no-scrollbar">
            <div className="min-h-full bg-gray-800 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
                <p>{t('loading_preview')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const handleInteraction = (e: React.MouseEvent, message: string) => {
    e.preventDefault();
    alert(message);
  };

  return (
    <div className="w-full max-w-[350px] mx-auto lg:sticky lg:top-24">
      <div className="relative border-[10px] border-black rounded-[40px] shadow-2xl bg-black">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-black rounded-b-xl z-10"></div>
        <div className="overflow-y-auto h-[650px] rounded-[30px] no-scrollbar">
          <React.Suspense fallback={<PreviewSpinner />}>
          {profileData?.theme === 'ecom' ? (
            <ProfileEcomTemplate
              profile={profileData}
              links={links}
              isMobilePreview={true}
            />
          ) : profileData?.theme === 'gastro' ? (
            <ProfileGastroTemplate
              profile={profileData}
              links={links}
              isMobilePreview={true}
            />
          ) : profileData?.theme === 'petcare' ? (
            <ProfilePetcareTemplate
              profile={profileData}
              links={links}
              isMobilePreview={true}
            />
          ) : profileData?.theme === 'medical' ? (
            <ProfileMedicalTemplate
              profile={profileData}
              links={links}
              isMobilePreview={true}
            />
          ) : profileData?.theme === 'realty' ? (
            <ProfileRealtyTemplate
              profile={profileData}
              links={links}
              isMobilePreview={true}
            />
          ) : profileData?.theme === 'sublima' ? (
            <ProfileSublimaTemplate
              profile={profileData}
              links={links}
              isMobilePreview={true}
            />
          ) : profileData?.theme === 'barber' ? (
            <ProfileBarberTemplate
              profile={profileData}
              links={links}
              isMobilePreview={true}
            />
          ) : profileData?.theme === 'stage' ? (
            <ProfileStageTemplate
              profile={profileData}
              links={links}
              isMobilePreview={true}
            />
          ) : (
            <div className="min-h-screen relative overflow-hidden" 
                 style={{ 
                   backgroundColor: profileData?.backgroundColor || '#210900',
                   color: profileData?.textColor || '#ffffff',
                   fontFamily: profileData?.fontFamily || 'Inter, sans-serif'
                 }}>

            {/* Imagen de Portada */}
            {profileData?.coverImageURL && (
              <div className="w-full h-32 overflow-hidden">
                <img
                  src={profileData.coverImageURL}
                  alt="Portada"
                  className="w-full h-full object-cover"
                                  />
              </div>
            )}

            <div className="relative flex flex-col items-center px-4">
              {/* Foto de Perfil */}
              <div className={profileData?.coverImageURL ? '-mt-12' : 'mt-4'}>
                {profileData?.profilePhotoURL && (
                  <img
                    src={profileData.profilePhotoURL}
                    alt="Foto de Perfil"
                    className="w-24 h-24 rounded-full object-cover border-4 shadow-lg"
                    style={{ borderColor: profileData?.backgroundColor || '#210900' }}
                                      />
                )}
              </div>

              {/* Nombre, Cargo, Empresa, Descripción */}
              <h1 className="mt-3 text-2xl font-bold text-center">{profileData?.displayName}</h1>
              {profileData?.jobTitle && <p className="text-md text-center mt-1 opacity-90">{profileData.jobTitle}</p>}
              {profileData?.company && <p className="text-sm text-center opacity-80">{profileData.company}</p>}
              {profileData?.bio && <p className="mt-2 text-center text-xs opacity-90 px-2">{profileData.bio}</p>}

              {/* Iconos de Contacto */}
              {(profileData?.phone || profileData?.whatsapp || profileData?.contactEmail) && (
                <div className="flex justify-center gap-2 mt-4">
                  {profileData?.phone && (
                    <div className="w-8 h-8 rounded-lg bg-white bg-opacity-10 flex items-center justify-center text-xs">
                      📞
                    </div>
                  )}
                  {profileData?.whatsapp && (
                    <div className="w-8 h-8 rounded-lg bg-white bg-opacity-10 flex items-center justify-center text-xs">
                      💬
                    </div>
                  )}
                  {profileData?.contactEmail && (
                    <div className="w-8 h-8 rounded-lg bg-white bg-opacity-10 flex items-center justify-center text-xs">
                      ✉️
                    </div>
                  )}
                </div>
              )}

              {/* Botones de Acción */}
              <div className="flex justify-center gap-2 mt-3 text-xs">
                <button className="px-3 py-1 bg-white bg-opacity-10 rounded-lg">{t('save_contact')}</button>
                <button className="px-3 py-1 bg-white bg-opacity-10 rounded-lg">{t('share')}</button>
                <button className="px-3 py-1 bg-white bg-opacity-10 rounded-lg">QR</button>
              </div>
            </div>

            {/* Contenedor de Secciones */}
            <div className="w-full px-3 mt-4 space-y-3 pb-4">
              
              {/* Video Destacado */}
              {profileData?.featuredVideoURL && (
                <div className="bg-white bg-opacity-5 rounded-lg p-3 border border-white border-opacity-10">
                  <h3 className="text-xs font-bold mb-2">{t('featured_video')}</h3>
                  <div className="aspect-video rounded-lg overflow-hidden bg-black">
                    <iframe
                      width="100%"
                      height="100%"
                      src={getEmbedUrl(profileData.featuredVideoURL)}
                      frameBorder="0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    ></iframe>
                  </div>
                </div>
              )}

              {/* Enlaces */}
              {Array.isArray(links) && links.length > 0 && (
                <div className="bg-white bg-opacity-5 rounded-lg p-3 border border-white border-opacity-10">
                  <h3 className="text-xs font-bold mb-2">{t('my_links')}</h3>
                  <div className="space-y-2">
                    {links.filter(l => l.isActive).map(link => (
                      <button
                        key={link.id}
                        onClick={(e) => handleInteraction(e, `Clic en: ${link.title}`)}
                        className={`block py-2 px-4 text-center font-bold text-xs w-full transition
                                  ${profileData?.buttonStyle === 'sharp' ? 'rounded-none' : profileData?.buttonStyle === 'pills' ? 'rounded-full' : 'rounded-md'}`}
                        style={{
                          backgroundColor: profileData?.buttonColor || '#ff6b35',
                          color: profileData?.buttonTextColor || '#ffffff',
                          borderWidth: `${(profileData?.borderWidth ?? 0)}px`,
                          borderColor: profileData?.borderColor || 'transparent',
                          borderStyle: 'solid',
                          boxShadow: profileData?.shadow === 'soft' ? '0 2px 4px rgba(0, 0, 0, 0.3)' : profileData?.shadow === 'hard' ? '0 4px 8px rgba(0, 0, 0, 0.5)' : 'none'
                        }}
                      >
                        {link.title}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Productos */}
              {Array.isArray(profileData?.products) && profileData.products.length > 0 && (
                <div className="bg-white bg-opacity-5 rounded-lg p-3 border border-white border-opacity-10">
                  <h3 className="text-xs font-bold mb-2">{t('products_title')}</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {profileData.products.map((product: any) => (
                      <div key={product.id} className="bg-white bg-opacity-5 rounded-md overflow-hidden">
                        {product.imageURL && (
                          <img
                            src={product.imageURL}
                            alt={product.name}
                            className="w-full h-16 object-cover"
                                                      />
                        )}
                        <div className="p-2">
                          <h4 className="text-xs font-semibold truncate">{product.name}</h4>
                          {product.price && (
                            <p className="text-xs font-bold mt-1">{product.price}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Galería */}
              {Array.isArray(profileData?.galleryImageURLs) && profileData.galleryImageURLs.length > 0 && (
                <div className="bg-white bg-opacity-5 rounded-lg p-3 border border-white border-opacity-10">
                  <h3 className="text-xs font-bold mb-2">{profileData?.galleryTitle || 'Galería'}</h3>
                  <div className="grid grid-cols-3 gap-1">
                    {profileData.galleryImageURLs.map((imgUrl: string, index: number) => (
                      <div key={index} className="aspect-square">
                        <img
                          src={imgUrl}
                          alt={`Galería ${index + 1}`}
                          className="w-full h-full object-cover rounded"
                                                  />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Testimonios */}
              {Array.isArray(profileData?.testimonials) && profileData.testimonials.length > 0 && (
                <div className="bg-white bg-opacity-5 rounded-lg p-3 border border-white border-opacity-10">
                  <h3 className="text-xs font-bold mb-2">{t('testimonials_title')}</h3>
                  <div className="space-y-2">
                    {profileData.testimonials.map((testimonial: any) => (
                      <div key={testimonial.id} className="bg-white bg-opacity-5 rounded-md p-2 text-center">
                        <p className="text-xs italic">"{testimonial.quote}"</p>
                        <p className="text-xs font-semibold mt-1">{testimonial.author}</p>
                        {testimonial.authorTitle && (
                          <p className="text-xs opacity-75">{testimonial.authorTitle}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Horarios */}
              {profileData?.showSchedule && Array.isArray(profileData?.businessHours) && profileData.businessHours.length > 0 && (
                <div className="bg-white bg-opacity-5 rounded-lg p-3 border border-white border-opacity-10">
                  <h3 className="text-xs font-bold mb-2">{t('schedule_title')}</h3>
                  <div className="space-y-1">
                    {profileData.businessHours.map((day: any, index: number) => (
                      <div key={index} className="flex justify-between text-xs">
                        <span className="capitalize">{day.day}</span>
                        <span className="opacity-80">
                          {day.isOpen && day.openTime && day.closeTime ? `${day.openTime} - ${day.closeTime}` : t('closed')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}


              {/* Calendar Preview */}
              {profileData?.showCalendar && profileData?.calendarWebhookUrl && (
                <div className="bg-white bg-opacity-5 rounded-lg p-3 border border-white border-opacity-10">
                  <a href={profileData.calendarWebhookUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider"
                    style={{ backgroundColor: profileData.buttonColor || '#ff6b35', color: profileData.buttonTextColor || '#fff' }}>
                    📅 Agendar
                  </a>
                </div>
              )}

              {/* Archivos Digitales */}
              {profileData?.plan === 'ultra' && Array.isArray(profileData?.digitalFiles) && profileData.digitalFiles.length > 0 && (
                <div className="bg-white bg-opacity-5 rounded-lg p-3 border border-white border-opacity-10">
                  <h3 className="text-xs font-bold mb-2">{t('digital_files')}</h3>
                  <div className="space-y-2">
                    {profileData.digitalFiles.map((file: any) => (
                      <div key={file.id} className="flex items-center gap-2 bg-white bg-opacity-5 rounded p-2">
                        <div className="w-6 h-6 bg-white bg-opacity-10 rounded flex items-center justify-center text-xs">
                          📄
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{file.title}</p>
                          <p className="text-xs opacity-60">{file.fileType?.toUpperCase()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* FAQs */}
              {profileData?.plan === 'ultra' && Array.isArray(profileData?.faqs) && profileData.faqs.length > 0 && (
                <div className="bg-white bg-opacity-5 rounded-lg p-3 border border-white border-opacity-10">
                  <h3 className="text-xs font-bold mb-2">{t('faqs_title')}</h3>
                  <div className="space-y-2">
                    {profileData.faqs.map((faq: any, index: number) => (
                      <div key={faq.id} className="border border-white border-opacity-10 rounded overflow-hidden">
                        <button
                          onClick={() => setOpenFaqIndex(openFaqIndex === index ? null : index)}
                          className="w-full flex items-center justify-between p-2 text-left hover:bg-white hover:bg-opacity-5"
                        >
                          <span className="text-xs font-semibold pr-2">{faq.question}</span>
                          <span className="text-xs">{openFaqIndex === index ? '▲' : '▼'}</span>
                        </button>
                        {openFaqIndex === index && (
                          <div className="px-2 pb-2 text-xs opacity-90">
                            {faq.answer}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="text-center py-2">
                {profileData?.logoURL ? (
                  <img
                    src={profileData.logoURL}
                    alt="Logo"
                    className="h-8 object-contain mx-auto opacity-70"
                                      />
                ) : (
                  <p className="text-xs opacity-50">Powered by Connexo</p>
                )}
              </div>
            </div>
          </div>
          )}
          </React.Suspense>
        </div>
      </div>
    </div>
  );
};