            {/* Sección Organizar Secciones del Perfil */}
            <Card>
                <h2 className="text-2xl font-bold mb-6">Organizar Secciones del Perfil</h2>
                <p className="text-sm text-gray-400 mb-4">
                  Arrastra y suelta para reorganizar el orden de las secciones en tu perfil público. Desmarca las secciones que no quieras mostrar.
                </p>
                
                {profileData.sectionOrder && profileData.sectionOrder.length > 0 ? (
                  <div className="space-y-2">
                    {profileData.sectionOrder
                      ?.slice()
                      .sort((a, b) => a.order - b.order)
                      .filter(section => {
                        if (['files', 'faqs'].includes(section.type) && profileData?.plan !== 'ultra') {
                          return false;
                        }
                        return true;
                      })
                      .map((section, index) => {
                        const sectionLabels = {
                          video: 'Video Destacado',
                          links: 'Mis Enlaces',
                          products: 'Productos/Servicios',
                          gallery: 'Galería',
                          files: 'Archivos Digitales',
                          testimonials: 'Testimonios',
                          faqs: 'Preguntas Frecuentes',
                          schedule: 'Horarios de Atención'
                        };
                        
                        return (
                          <div 
                            key={section.type} 
                            className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border"
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col gap-1">
                                <button
                                  onClick={() => {
                                    if (index === 0) return;
                                    const updated = [...profileData.sectionOrder];
                                    const temp = updated[index].order;
                                    updated[index].order = updated[index - 1].order;
                                    updated[index - 1].order = temp;
                                    setProfileData(prev => ({ ...prev, sectionOrder: updated }));
                                  }}
                                  disabled={index === 0}
                                  className="text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => {
                                    if (index === profileData.sectionOrder.length - 1) return;
                                    const updated = [...profileData.sectionOrder];
                                    const temp = updated[index].order;
                                    updated[index].order = updated[index + 1].order;
                                    updated[index + 1].order = temp;
                                    setProfileData(prev => ({ ...prev, sectionOrder: updated }));
                                  }}
                                  disabled={index === profileData.sectionOrder.length - 1}
                                  className="text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed"
                                >
                                  ▼
                                </button>
                              </div>
                              
                              <span className="font-medium">{sectionLabels[section.type] || section.type}</span>
                            </div>
                            
                            <ToggleSwitch
                              checked={section.enabled}
                              onChange={() => {
                                const updated = profileData.sectionOrder.map(s => 
                                  s.type === section.type ? { ...s, enabled: !s.enabled } : s
                                );
                                setProfileData(prev => ({ ...prev, sectionOrder: updated }));
                              }}
                            />
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No hay configuración de secciones disponible.
                  </p>
                )}
                
                <div className="mt-6">
                  <Button onClick={async () => {
                    if (!user) return;
                    await setDoc(doc(db, 'profiles', user.uid), { sectionOrder: profileData.sectionOrder }, { merge: true });
                  }}>
                    💾 Guardar Orden de Secciones
                  </Button>
                </div>
            </Card>

            {/* Modal del Formulario de Testimonios */}
            {isTestimonialFormOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold">
                                    {editingTestimonial ? 'Editar Testimonio' : 'Añadir Testimonio'}
                                </h3>
                                <button
                                    onClick={closeTestimonialForm}
                                    className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="space-y-4">
                                {/* Cita/Testimonio */}
                                <Textarea
                                    id="testimonial-quote"
                                    label="Cita/Testimonio *"
                                    value={testimonialForm.quote}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, quote: e.target.value }))}
                                    placeholder="Escribe la cita o testimonio aquí..."
                                    required
                                />

                                {/* Autor */}
                                <Input
                                    id="testimonial-author"
                                    label="Autor *"
                                    type="text"
                                    value={testimonialForm.author}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, author: e.target.value }))}
                                    placeholder="Nombre del autor"
                                    required
                                />

                                {/* Cargo/Título del Autor */}
                                <Input
                                    id="testimonial-authorTitle"
                                    label="Cargo/Título del Autor"
                                    type="text"
                                    value={testimonialForm.authorTitle}
                                    onChange={(e) => setTestimonialForm(prev => ({ ...prev, authorTitle: e.target.value }))}
                                    placeholder="Ej: CEO, Desarrollador, Cliente..."
                                />

                                {/* Foto del Autor */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Foto del Autor
                                    </label>
                                    <div className="flex items-center gap-4">
                                        {testimonialForm.authorImageURL && (
                                            <img
                                                src={testimonialForm.authorImageURL}
                                                alt="Vista previa"
                                                className="w-16 h-16 rounded-full object-cover border"
                                                onError={undefined}
                                            />
                                        )}
                                        <label className="cursor-pointer bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors">
                                            📷 Subir Foto
                                            <input
                                                type="file"
                                                accept="image/*"
                                                onChange={handleTestimonialImageUpload}
                                                className="hidden"
                                            />
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end gap-3 mt-6">
                                <Button onClick={closeTestimonialForm} variant="secondary">
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={editingTestimonial ? handleUpdateTestimonial : handleAddTestimonial}
                                    className="!px-6"
                                >
                                    {editingTestimonial ? '💾 Actualizar' : '💾 Guardar'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
